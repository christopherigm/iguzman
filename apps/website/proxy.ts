import { createAuthProxy } from "@repo/auth/proxy";

// `/favorites`, `/cart` and `/orders` are deliberately **not** here any more: a
// visitor with no account has a cart and saved items (in their browser), may
// check out as a guest, and reaches the resulting order at `/orders/<public_id>`
// with no session at all. The order *history* list at `/orders` is still
// signed-in only - it guards itself in the page, since a prefix cannot tell the
// list apart from one public order underneath it.
export default createAuthProxy({
  protectedPrefixes: ["/admin", "/account"],
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
