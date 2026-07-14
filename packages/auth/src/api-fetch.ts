import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  COOKIE_OPTS,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  apiUrl,
  refreshTokens,
} from "./tokens";

/**
 * Wraps fetch so a transport-level failure (ETIMEDOUT, ECONNREFUSED, DNS) returns
 * null instead of throwing an unhandled "TypeError: fetch failed" out of the route
 * handler - lets callers degrade to a 503 rather than crashing the request.
 */
async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
}

/** Persist a fresh token pair (from login, signup, or passkey) into cookies. */
export async function setAuthCookies(
  access: string,
  refresh: string,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE, access, {
    ...COOKIE_OPTS,
    maxAge: ACCESS_MAX_AGE,
  });
  cookieStore.set(REFRESH_COOKIE, refresh, {
    ...COOKIE_OPTS,
    maxAge: REFRESH_MAX_AGE,
  });
}

/** Drop both token cookies. */
export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}

/**
 * Refresh the access token and persist the new pair. Route handlers may write
 * cookies, so unlike the server-component path this refresh actually sticks.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;

  const tokens = await refreshTokens(refresh);

  // A transient network error must not look like an invalid refresh token, or we
  // would clear the cookies and log the user out on a blip. `refreshTokens`
  // cannot distinguish the two, so err toward keeping the session: the caller
  // 401s this one request and the next attempt can still succeed.
  if (!tokens) return null;

  await setAuthCookies(tokens.access, tokens.refresh ?? refresh);
  return tokens.access;
}

/**
 * Rebuild the token pair from the live user and persist it.
 *
 * Call this after anything that changes an identity claim (a profile rename, an
 * admin grant). The ordinary refresh flow cannot pick such a change up: SimpleJWT
 * copies claims from the *refresh* token, so a stale claim would survive every
 * refresh until the 7-day refresh token finally expired.
 *
 * Best-effort - a failure here leaves the old (still valid) tokens in place, so
 * the UI is at worst briefly stale rather than logged out.
 */
export async function reissueTokens(): Promise<void> {
  const res = await apiFetch("/api/auth/token/reissue/", { method: "POST" });
  if (!res.ok) return;
  const data = (await res.json().catch(() => null)) as {
    access?: string;
    refresh?: string;
  } | null;
  if (data?.access && data.refresh) {
    await setAuthCookies(data.access, data.refresh);
  }
}

export interface ApiFetchInit extends RequestInit {
  /**
   * Let a logged-out request fall through to Django without an Authorization
   * header instead of short-circuiting to 401 - Django's IsAuthenticatedOrReadOnly
   * then serves the GET publicly. For read-only endpoints anonymous users can see.
   */
  allowAnonymous?: boolean;
}

/**
 * Call the Django API from a route handler with the caller's access token,
 * refreshing and retrying once when the token has expired.
 *
 * Every route handler that talks to Django must go through this - a manual
 * cookie read plus fetch skips the refresh-and-retry and turns an expired token
 * into a spurious 401 in the browser.
 */
export async function apiFetch(
  path: string,
  init: ApiFetchInit = {},
): Promise<Response> {
  const { allowAnonymous, ...requestInit } = init;
  const cookieStore = await cookies();
  const API = apiUrl();

  let token = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!token) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      if (allowAnonymous) {
        const anon = await safeFetch(`${API}${path}`, requestInit);
        return anon ?? unavailable();
      }
      return unauthorized();
    }
    token = newToken;
  }

  const withAuth = (t: string): RequestInit => ({
    ...requestInit,
    headers: {
      ...(requestInit.headers as Record<string, string>),
      Authorization: `Bearer ${t}`,
    },
  });

  let res = await safeFetch(`${API}${path}`, withAuth(token));
  if (!res) return unavailable();

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return unauthorized();
    res = await safeFetch(`${API}${path}`, withAuth(newToken));
    if (!res) return unavailable();
  }

  return res;
}

function unauthorized(): Response {
  return Response.json({ detail: "Unauthorized" }, { status: 401 });
}

function unavailable(): Response {
  return Response.json({ detail: "Service unavailable" }, { status: 503 });
}
