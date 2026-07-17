import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@repo/i18n/routing";
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  COOKIE_OPTS,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  isAccessUsable,
  refreshTokens,
} from "./tokens";

const intlMiddleware = createMiddleware(routing);

export interface AuthProxyOptions {
  /**
   * Locale-less path prefixes that require a session. A logged-out request to
   * one of these is redirected to /auth; everything else renders as anonymous.
   */
  protectedPrefixes: string[];
  /** Where to send a logged-out user. Defaults to "/auth". */
  authPath?: string;
}

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?/, "");
}

function localeOf(pathname: string): string {
  return pathname.split("/")[1] ?? routing.defaultLocale;
}

/**
 * next-intl middleware plus JWT session upkeep.
 *
 * The refresh runs on **every** page request, not just protected ones. Public
 * pages render auth-dependent UI too (a catalog card's edit button, the navbar's
 * account menu), and those are server-rendered from the access token - so if a
 * public page were served with an expired token, it would paint logged-out even
 * though the user has a perfectly good refresh token. Refreshing here keeps the
 * server's view of the session and the user's actual session in agreement.
 *
 * The proxy is also the only place in a page render that may *write* cookies, so
 * it is the only place a refresh can be persisted. Server components read the
 * result via `getSession()`.
 */
export function createAuthProxy({
  protectedPrefixes,
  authPath = "/auth",
}: AuthProxyOptions) {
  const isProtectedPath = (pathname: string): boolean => {
    const withoutLocale = stripLocale(pathname);
    return protectedPrefixes.some((prefix) => withoutLocale.startsWith(prefix));
  };

  const redirectToAuth = (request: NextRequest): NextResponse => {
    const res = NextResponse.redirect(
      new URL(`/${localeOf(request.nextUrl.pathname)}${authPath}`, request.url),
    );
    // Only clear cookies we were actually shown. Set-Cookie is not subject to
    // SameSite, so a request that merely could not send its cookies would
    // otherwise have them deleted here - turning one unreadable request into a
    // real logout, with the tokens still perfectly valid.
    if (request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE)) {
      res.cookies.delete(ACCESS_COOKIE);
      res.cookies.delete(REFRESH_COOKIE);
    }
    return res;
  };

  return async function proxy(request: NextRequest): Promise<NextResponse> {
    const access = request.cookies.get(ACCESS_COOKIE)?.value;
    const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
    const protectedPath = isProtectedPath(request.nextUrl.pathname);

    if (isAccessUsable(access)) return intlMiddleware(request);

    // No refresh token either → genuinely logged out. Protected pages bounce to
    // /auth; public pages render anonymously, which is correct, not a failure.
    if (!refresh) {
      return protectedPath ? redirectToAuth(request) : intlMiddleware(request);
    }

    const tokens = await refreshTokens(refresh);
    if (!tokens) {
      return protectedPath ? redirectToAuth(request) : intlMiddleware(request);
    }

    // Make the *current* request see the new token: mutating request.cookies
    // updates the forwarded cookie header before next-intl clones it, so
    // getSession() in the layout below decodes the fresh token, not the stale one.
    request.cookies.set(ACCESS_COOKIE, tokens.access);

    const response = intlMiddleware(request);
    response.cookies.set(ACCESS_COOKIE, tokens.access, {
      ...COOKIE_OPTS,
      maxAge: ACCESS_MAX_AGE,
    });
    if (tokens.refresh) {
      response.cookies.set(REFRESH_COOKIE, tokens.refresh, {
        ...COOKIE_OPTS,
        maxAge: REFRESH_MAX_AGE,
      });
    }
    return response;
  };
}

/**
 * The matcher CANNOT be shared from here.
 *
 * Next.js statically analyses `export const config = { matcher: ... }` at build
 * time and needs a literal - an imported constant silently fails to parse, and
 * the proxy then runs on *every* request, including /api/*. The intl middleware
 * would then redirect POST /api/auth/login to /en/api/auth/login and login would
 * break. So each app inlines its own matcher literal:
 *
 *   export const config = {
 *     matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
 *   };
 *
 * The proxy always runs on the Node.js runtime in Next.js 16, so API_URL
 * (injected at runtime via a k8s secret, not baked at build time) is available.
 */
