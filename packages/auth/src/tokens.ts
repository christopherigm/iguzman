/**
 * Cookie and JWT primitives shared by the server session, the API fetcher, and
 * the auth proxy. Nothing here reaches the browser: the tokens live in HTTP-only
 * cookies and are only ever read on the Next.js server.
 */

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

const IS_PROD = process.env.NODE_ENV === "production";

// `lax`, not `strict`. Strict withholds the cookies on a cross-site top-level
// navigation, which is exactly how a customer comes back from a hosted payment
// or OAuth page (Stripe Checkout → /orders/<id>): the request would arrive with
// no cookies, read as logged out, and bounce to /auth. Lax still withholds them
// on cross-site POST/fetch, which is the CSRF protection that actually matters
// here - no state-changing GET is authenticated by these cookies alone.
export const COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "lax" as const,
  path: "/",
};

// The access cookie deliberately outlives the 1h JWT (see ACCESS_TOKEN_LIFETIME
// in each API's settings.py) so an expired access token gets refreshed by the
// proxy rather than looking like a logout.
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 7;
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;

/** The Django API base URL. Server-only - never expose this as NEXT_PUBLIC_. */
export function apiUrl(): string {
  return process.env.API_URL ?? "http://127.0.0.1:8000";
}

/**
 * Identity carried in the access token, as minted by each API's
 * `CustomTokenObtainPairSerializer.get_token`.
 */
export interface TokenClaims {
  /** SimpleJWT serialises the user id as a string, not a number. */
  user_id: string | number;
  email?: string;
  first_name?: string;
  last_name?: string;
  /** website-api only; absent (→ false) elsewhere. */
  is_admin?: boolean;
  /** website-api only; absent (→ null) elsewhere. */
  system_id?: number | null;
  exp?: number;
}

/** The session as the app consumes it, on both the server and the client. */
export interface Session {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  /** What the navbar renders. Matches the old localStorage `displayName`. */
  displayName: string;
  isAdmin: boolean;
  systemId: number | null;
}

/**
 * Decode the JWT payload without verifying the signature. Safe here because the
 * token came from our own HTTP-only cookie and is only used to render UI -
 * Django verifies the signature on every call that actually touches data.
 */
export function decodeClaims(token: string): TokenClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as TokenClaims;
  } catch {
    return null;
  }
}

/**
 * Whether the access token is still within its lifetime. Cookie presence alone
 * no longer implies validity (the cookie outlives the JWT), so callers must ask
 * this before trusting a token. An undecodable token counts as expired, so we
 * refresh rather than 401.
 */
export function isAccessUsable(token: string | undefined): boolean {
  if (!token) return false;
  const claims = decodeClaims(token);
  if (!claims || typeof claims.exp !== "number") return false;
  return claims.exp * 1000 > Date.now();
}

/** Build the app-facing session from token claims. */
export function sessionFromClaims(claims: TokenClaims): Session {
  const firstName = claims.first_name ?? "";
  const email = claims.email ?? "";
  // Home-screen and navbar space is tight; the old localStorage session applied
  // the same 10-char cap, so keep it to avoid a layout change.
  const displayName = (firstName.trim() || email).substring(0, 10);
  return {
    // Coerced because SimpleJWT emits the id as a string; callers expect a number.
    userId: Number(claims.user_id),
    email,
    firstName,
    lastName: claims.last_name ?? "",
    displayName,
    isAdmin: claims.is_admin === true,
    systemId: claims.system_id ?? null,
  };
}

/**
 * Exchange a refresh token for a new token pair. Returns null on a rejected or
 * unreachable refresh - the caller decides whether that means "log out" or
 * "transient failure, keep the cookies".
 */
export async function refreshTokens(
  refresh: string,
): Promise<{ access: string; refresh?: string } | null> {
  try {
    const res = await fetch(`${apiUrl()}/api/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { access: string; refresh?: string };
  } catch {
    return null;
  }
}
