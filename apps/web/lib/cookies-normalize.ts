import { z } from 'zod';

const rawCookieSchema = z
  .object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
    path: z.string().optional(),
    expires: z.number().optional(),
    expirationDate: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.string().nullable().optional(),
    hostOnly: z.boolean().optional(),
    session: z.boolean().optional(),
    storeId: z.string().nullable().optional(),
  })
  .passthrough();

function normalizeSameSite(s?: string | null): 'Strict' | 'Lax' | 'None' | undefined {
  if (!s) return undefined;
  const v = String(s).toLowerCase();
  if (v === 'strict') return 'Strict';
  if (v === 'lax' || v === 'unspecified' || v === 'no_restriction') return 'Lax';
  if (v === 'none') return 'None';
  return 'Lax';
}

// The cookies that actually gate a Google session — NOT every cookie in a
// browser export. A full dump also carries short-lived, frequently-rotated
// ones (NID, SIDCC, __Secure-*TS/RTS, analytics _ga*) whose expiry has
// nothing to do with when the login itself ends; using the min across ALL
// of them (as an earlier version of this code did) marked freshly-pasted
// accounts as "expiring" within minutes even when the real session was
// good for months.
const AUTH_COOKIE_NAMES = new Set([
  'SID',
  'HSID',
  'SSID',
  'APISID',
  'SAPISID',
  '__Secure-1PSID',
  '__Secure-3PSID',
  '__Secure-1PAPISID',
  '__Secure-3PAPISID',
]);

/**
 * Earliest expiry (ISO string) across the auth-critical cookies, or null if
 * none carry a future numeric expiry (e.g. session-only exports).
 */
export function computeCookiesExpireAt(cookies: unknown): string | null {
  if (!Array.isArray(cookies)) return null;
  const expirations = cookies
    .filter((c: any) => c && AUTH_COOKIE_NAMES.has(c.name))
    .map((c: any) => {
      const v = c.expires ?? c.expirationDate;
      if (typeof v !== 'number') return null;
      return v < 1e12 ? v * 1000 : v; // seconds vs ms
    })
    .filter((n): n is number => typeof n === 'number' && n > Date.now());
  if (expirations.length === 0) return null;
  return new Date(Math.min(...expirations)).toISOString();
}

export function normalizeCookies(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((c) => {
    const parsed = rawCookieSchema.safeParse(c);
    if (!parsed.success) return c;
    const r = parsed.data;
    return {
      name: r.name,
      value: r.value,
      domain: r.domain,
      path: r.path ?? '/',
      expires: r.expires ?? r.expirationDate,
      httpOnly: r.httpOnly,
      secure: r.secure,
      sameSite: normalizeSameSite(r.sameSite ?? undefined),
    };
  });
}
