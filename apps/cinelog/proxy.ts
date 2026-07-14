import { createAuthProxy } from "@repo/auth/proxy";

// The catalog, movie detail and statistics pages stay public - they render
// read-only for anonymous visitors and gain write actions when a session exists.
export default createAuthProxy({
  protectedPrefixes: ["/account", "/add-movie", "/tv"],
});

// The matcher must be an inline literal: Next.js statically analyses it at build
// time and an imported constant silently fails to parse, which would run the
// proxy on /api/* and break login. See @repo/auth/proxy.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
