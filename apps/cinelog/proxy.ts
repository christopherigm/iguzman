import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@repo/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const PROTECTED_PREFIXES = ['/account'];

function isProtectedPath(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?/, '');
  return PROTECTED_PREFIXES.some((prefix) => withoutLocale.startsWith(prefix));
}

export default function proxy(request: NextRequest) {
  if (isProtectedPath(request.nextUrl.pathname)) {
    const hasAccess = !!request.cookies.get('access_token')?.value;
    const hasRefresh = !!request.cookies.get('refresh_token')?.value;
    if (!hasAccess && !hasRefresh) {
      const locale = request.nextUrl.pathname.split('/')[1] ?? 'en';
      return NextResponse.redirect(new URL(`/${locale}/auth`, request.url));
    }
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
