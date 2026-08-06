import { createAuthProxy } from '@repo/auth/proxy';

// Locale-less prefixes that require a session. Everything else renders for
// anonymous visitors - the proxy still refreshes their token on every page, so a
// public page with auth-dependent UI (the navbar account menu) paints correctly.
// `/admin` keeps an anonymous visitor out; the CMS pages themselves re-check
// `session.isAdmin`, which is what a prefix guard cannot do - a signed-in but
// ordinary reader sails past it with a perfectly valid session. Neither is what
// actually protects the data: Django re-derives the permission from the token on
// every call (core/permissions.py). They decide what is worth rendering.
// ⚠ `/contributions` is guarded but `/contribute` deliberately is not, and the
// difference is the point. The FAB that opens `/contribute` is shown to
// everybody - that is how a reader discovers the site takes contributions at all
// - so an anonymous press is expected and is answered with a `SignInPrompt`.
// There is no such thing as "your contributions" for an account that does not
// exist, so this one has nothing to show a signed-out visitor and the guard is
// the right answer.
export default createAuthProxy({
  protectedPrefixes: ['/account', '/admin', '/contributions'],
});

// The matcher must be an inline literal: Next.js statically analyses it at build
// time and an imported constant silently fails to parse, which would run the
// proxy on /api/* and break login. See @repo/auth/proxy.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
