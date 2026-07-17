import { createAuthProxy } from "@repo/auth/proxy";

export default createAuthProxy({
  protectedPrefixes: ["/admin", "/account", "/favorites", "/cart", "/orders"],
});

// The matcher must be an inline literal: Next.js statically analyses it at build
// time and an imported constant silently fails to parse, which would run the
// proxy on /api/* and break login. See @repo/auth/proxy.
// ~offline is also excluded so the PWA fallback renders with no session.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|~offline).*)",
  ],
};
