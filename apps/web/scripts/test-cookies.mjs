// Test the actual cookies user pasted
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

function normalizeSameSite(s) {
  if (!s) return undefined;
  const v = String(s).toLowerCase();
  if (v === 'strict') return 'Strict';
  if (v === 'lax' || v === 'unspecified' || v === 'no_restriction') return 'Lax';
  if (v === 'none') return 'None';
  return 'Lax';
}

function normalizeCookies(raw) {
  if (!Array.isArray(raw)) return raw;
  return raw.map((c) => {
    const parsed = rawCookieSchema.safeParse(c);
    if (!parsed.success) {
      console.log('rawCookieSchema FAILED on:', JSON.stringify(c).slice(0, 100));
      console.log(parsed.error.issues);
      return c;
    }
    const r = parsed.data;
    return {
      name: r.name,
      value: r.value,
      domain: r.domain,
      path: r.path ?? '/',
      expires: r.expires ?? r.expirationDate,
      httpOnly: r.httpOnly,
      secure: r.secure,
      sameSite: normalizeSameSite(r.sameSite),
    };
  });
}

const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
});
const cookiesArraySchema = z.array(cookieSchema);

// Sample of user's cookies (with sameSite null, session=true, etc)
const userInput = [
  {
    domain: ".chatgpt.com",
    expirationDate: 1779642069,
    hostOnly: false, httpOnly: false,
    name: "_ga", path: "/", sameSite: null, secure: false, session: false, storeId: null,
    value: "GA1.1.627956611.1763874069"
  },
  {
    domain: "chatgpt.com",
    hostOnly: true, httpOnly: true,
    name: "__Host-next-auth.csrf-token", path: "/", sameSite: "lax", secure: true, session: true, storeId: null,
    value: "abc%7Cdef"
  },
  {
    domain: ".chatgpt.com",
    expirationDate: 1777488713.008015,
    hostOnly: false, httpOnly: true,
    name: "__cf_bm", path: "/", sameSite: null, secure: true, session: false, storeId: null,
    value: "Br9j6mN6"
  },
];

const normalized = normalizeCookies(userInput);
console.log('Normalized:', JSON.stringify(normalized, null, 2));

const result = cookiesArraySchema.safeParse(normalized);
console.log('\nValidation:', result.success ? 'PASS ✓' : 'FAIL');
if (!result.success) console.log(JSON.stringify(result.error.issues, null, 2));
