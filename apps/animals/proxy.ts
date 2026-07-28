import { createAuthProxy } from '@repo/auth/proxy';

// Locale-less prefixes that require a session. Everything else renders for
// anonymous visitors - the proxy still refreshes their token on every page, so a
// public page with auth-dependent UI (the navbar account menu) paints correctly.
export default createAuthProxy({
  protectedPrefixes: ['/account'],
});

// The matcher must be an inline literal: Next.js statically analyses it at build
// time and an imported constant silently fails to parse, which would run the
// proxy on /api/* and break login. See @repo/auth/proxy.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
