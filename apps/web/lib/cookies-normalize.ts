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
