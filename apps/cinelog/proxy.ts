import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@repo/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const PROTECTED_PREFIXES = ['/account', '/inbox'];

const IS_PROD = process.env.NODE_ENV === 'production';
// Access cookie outlives the 1h JWT (see settings.py ACCESS_TOKEN_LIFETIME) so an
// expired access token is refreshed here rather than looking like a logged-out user.
const ACCESS_MAX_AGE = 60 * 60 * 24 * 7;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;
const COOKIE_OPTS = { httpOnly: true, secure: IS_PROD, sameSite: 'strict' as const, path: '/' };

function isProtectedPath(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?/, '');
  return PROTECTED_PREFIXES.some((prefix) => withoutLocale.startsWith(prefix));
}

function localeOf(pathname: string): string {
  return pathname.split('/')[1] ?? 'en';
}

// The access cookie now outlives the JWT (maxAge 7d), so cookie presence no
// longer implies a valid token. Decode the unverified `exp` claim to decide
// whether a refresh is needed — Django still verifies the signature on use.
// Treat any undecodable token as expired so we refresh rather than 401.
function isAccessUsable(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: number };
    if (typeof claims.exp !== 'number') return false;
    return claims.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function redirectToAuth(request: NextRequest): NextResponse {
  const res = NextResponse.redirect(
    new URL(`/${localeOf(request.nextUrl.pathname)}/auth`, request.url),
  );
  res.cookies.delete('access_token');
  res.cookies.delete('refresh_token');
  return res;
}

async function refreshTokens(refresh: string): Promise<{ access: string; refresh?: string } | null> {
  const api = process.env.API_URL;
  if (!api) return null;
  try {
    const res = await fetch(`${api}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { access: string; refresh?: string };
  } catch {
    return null;
  }
}

export default async function proxy(request: NextRequest) {
  if (isProtectedPath(request.nextUrl.pathname)) {
    const access = request.cookies.get('access_token')?.value;
    const refresh = request.cookies.get('refresh_token')?.value;

    if (!isAccessUsable(access)) {
      // No usable refresh token either → genuinely logged out.
      if (!refresh) return redirectToAuth(request);

      // Access token expired but refresh is still valid. Refresh here (middleware
      // is one of the few places allowed to set cookies) so server components that
      // read the cookie directly don't hard-redirect to /auth on expiry.
      const tokens = await refreshTokens(refresh);
      if (!tokens) return redirectToAuth(request);

      // Make the *current* request see the new token: mutating request.cookies
      // updates the forwarded cookie header before next-intl clones it.
      request.cookies.set('access_token', tokens.access);

      const response = intlMiddleware(request);
      response.cookies.set('access_token', tokens.access, { ...COOKIE_OPTS, maxAge: ACCESS_MAX_AGE });
      if (tokens.refresh) {
        response.cookies.set('refresh_token', tokens.refresh, { ...COOKIE_OPTS, maxAge: REFRESH_MAX_AGE });
      }
      return response;
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Proxy always runs on the Node.js runtime in Next.js 16, so API_URL (injected
  // at runtime via k8s secret, not baked at build time) is available here.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
