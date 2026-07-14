import { cookies } from "next/headers";
import { cache } from "react";
import {
  ACCESS_COOKIE,
  decodeClaims,
  isAccessUsable,
  sessionFromClaims,
  type Session,
} from "./tokens";

/**
 * The signed-in user for the current request, or null when logged out.
 *
 * This is the single source of truth for identity. It reads the HTTP-only access
 * cookie the browser already sent and decodes the identity claims the API mints
 * into it, so a server component knows who the user is *before* it renders -
 * which is what stops a page from painting logged-out and then snapping to
 * logged-in once the browser catches up.
 *
 * It never refreshes: `createAuthProxy` has already replaced an expired access
 * token on this request (server components cannot write cookies, so a refresh
 * here could not be persisted anyway). By the time this runs, the cookie is
 * current - an expired one here means the refresh token was rejected too, i.e.
 * genuinely logged out.
 *
 * `cache()` collapses the repeated calls in a single render (layout, page, and
 * any server component that asks) into one decode.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!isAccessUsable(token)) return null;
  const claims = decodeClaims(token!);
  return claims ? sessionFromClaims(claims) : null;
});

export type { Session };
