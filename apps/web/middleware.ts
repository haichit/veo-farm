import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/api/health',
  // API-key-reachable routes: no session cookie on an external script's
  // request, so the cookie-only check below would otherwise redirect it to
  // /login instead of ever reaching the route handler. Each of these does
  // its own auth via resolveAuth() (session cookie OR Bearer API key) —
  // this just lets requests with neither reach that check and get a clean
  // 401 JSON instead of an HTML redirect. Key management itself
  // (/api/api-keys) is intentionally NOT here — it stays session-only.
  '/api/run-workflow-builder',
  '/api/workflows',
  '/api/jobs-queue',
  '/api/runs',
  '/api/workflow-builder-stop',
];

const AUTH_PAGES = new Set(['/login', '/signup', '/forgot-password']);

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (user && AUTH_PAGES.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Suspended-account guard.
  if (user && !isPublic && pathname !== '/suspended') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.status === 'suspended') {
      const url = req.nextUrl.clone();
      url.pathname = '/suspended';
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
