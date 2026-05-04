import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/encryption';

interface Cookie {
  name: string;
  value: string;
  domain?: string;
}

// HEAD-style probe: load Flow page with the account's cookies and see if
// Google bounces us to a sign-in URL. Veo3-only — Gemini and others use
// different auth surfaces and would need their own probes.
//
// We shell out to `curl` because previous experience (project memory:
// `feedback_node_fetch_google_cdn`) is that undici's TLS fingerprint gets
// rejected by *.google.com endpoints with ECONNRESET. curl uses OpenSSL
// system fingerprint and works.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = createSupabaseServerClient();
  const { data: account, error } = await sb
    .from('accounts')
    .select('id, provider_id, cookies_encrypted')
    .eq('id', params.id)
    .single();
  if (error || !account) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (account.provider_id !== 'veo3') {
    return NextResponse.json({
      ok: true,
      skipped: 'only_veo3_supported',
    });
  }

  let cookies: Cookie[];
  try {
    cookies = JSON.parse(decrypt(account.cookies_encrypted));
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: `decrypt_failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
  const cookieHeader = cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const result = await probeFlowPage(cookieHeader);

  // Reflect probe result into accounts.status so the UI chip stays honest.
  // We skip touching status when the account is currently busy — the worker
  // is mid-generation and will release with the correct status itself.
  await sb
    .from('accounts')
    .update({
      status: result.ok ? 'idle' : 'expired',
      last_error: result.ok ? null : result.reason ?? 'cookies_test_failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .neq('status', 'busy');

  return NextResponse.json(result);
}

interface ProbeResult {
  ok: boolean;
  reason?: string;
  finalUrl?: string;
  status?: number;
}

function probeFlowPage(cookieHeader: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const args = [
      '-sS',
      '-o', '/dev/null',
      '-w', '%{http_code}\n%{url_effective}',
      '-L', // follow redirects so we see the final destination
      '--max-redirs', '5',
      '--max-time', '15',
      '-A',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      '-H',
      `Cookie: ${cookieHeader}`,
      'https://labs.google/fx/vi/tools/flow',
    ];
    const p = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (c) => (stdout += c.toString()));
    p.stderr.on('data', (c) => (stderr += c.toString()));
    p.on('error', (e) =>
      resolve({ ok: false, reason: `curl_spawn: ${e.message}` }),
    );
    p.on('close', () => {
      const [codeRaw, urlRaw] = stdout.split('\n');
      const status = Number(codeRaw);
      const finalUrl = (urlRaw ?? '').trim();
      if (!Number.isFinite(status)) {
        return resolve({
          ok: false,
          reason: `bad_curl_output: ${stderr.slice(-200) || stdout.slice(0, 200)}`,
        });
      }
      // Cookies dead → final URL lands on Google's sign-in page.
      if (/accounts\.google\.com\/.*signin|ServiceLogin/i.test(finalUrl)) {
        return resolve({
          ok: false,
          reason: 'redirected_to_signin',
          finalUrl,
          status,
        });
      }
      if (status >= 200 && status < 400) {
        return resolve({ ok: true, finalUrl, status });
      }
      resolve({
        ok: false,
        reason: `http_${status}`,
        finalUrl,
        status,
      });
    });
  });
}
