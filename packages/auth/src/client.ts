"use client";

/**
 * Browser-side auth calls. Every one of these hits the app's own route handlers
 * under /api/auth/*, never Django directly - the tokens live in HTTP-only
 * cookies the browser cannot read, and the route handler attaches them.
 *
 * These functions deliberately do not touch any client-side session store. The
 * session is derived on the server from the cookie (see `getSession`), so after
 * a call that changes it the caller runs `router.refresh()` to re-render with
 * the new one. See `useAuthNavigation` for the standard sequence.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super("API request failed");
  }
}

export class LoginError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super("Login failed");
  }
}

async function post(
  path: string,
  body?: unknown,
  ErrorClass: typeof ApiError = ApiError,
): Promise<Response> {
  const res = await fetch(path, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ErrorClass(res.status, data);
  }
  return res;
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<void> {
  await post("/api/auth/login", payload, LoginError);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function signUp(payload: {
  email: string;
  password: string;
  password2: string;
  first_name?: string;
  last_name?: string;
}): Promise<void> {
  await post("/api/auth/signup", payload);
}

export async function verifyEmail(token: string): Promise<void> {
  const res = await fetch(`/api/auth/verify-email/${token}`);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await post("/api/auth/password-reset", { email });
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string,
  newPassword2: string,
): Promise<void> {
  await post("/api/auth/password-reset/confirm", {
    token,
    new_password: newPassword,
    new_password2: newPassword2,
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  newPassword2: string,
): Promise<void> {
  await post("/api/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
    new_password2: newPassword2,
  });
}

export async function uploadProfilePicture(
  base64Image: string,
): Promise<{ profile_picture: string | null }> {
  const res = await post("/api/auth/profile/picture", {
    base64_image: base64Image,
  });
  return res.json() as Promise<{ profile_picture: string | null }>;
}

// ── Profile ──────────────────────────────────────────────────────────────────

/**
 * The fields every frontend's profile endpoint returns. Apps extend this with
 * their own (edge-folio carries the career fields, website `is_admin` /
 * `system_id`) and pass that type as `T`.
 */
export interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  profile_picture: string | null;
}

// In-flight request dedupe: on some pages two components ask for the profile in
// the same tick (edge-folio's profile page and its job-search section do).
// Collapsing concurrent calls into one request avoids the duplicate round-trip;
// the cache clears as soon as it settles, so later navigations still fetch fresh.
let profileInFlight: Promise<unknown> | null = null;

/**
 * The full profile, including the fields too volatile or too large to carry in a
 * JWT (the avatar, and whatever else an app hangs off its user). The navbar does
 * not need this - it renders from the session.
 */
export function getProfile<T extends UserProfile = UserProfile>(): Promise<T> {
  if (profileInFlight) return profileInFlight as Promise<T>;
  const request = (async () => {
    const res = await fetch("/api/auth/profile");
    if (!res.ok) {
      const data: Record<string, unknown> = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data);
    }
    return res.json() as Promise<T>;
  })().finally(() => {
    profileInFlight = null;
  });
  profileInFlight = request;
  return request;
}

/**
 * Rename the user. The API reissues both tokens (the name is a JWT claim that
 * would otherwise stay stale for the life of the refresh token), so the caller
 * must `router.refresh()` to re-render the server with the new session.
 */
export async function updateProfile<
  T extends UserProfile = UserProfile,
>(payload: { first_name?: string; last_name?: string }): Promise<T> {
  const res = await fetch("/api/auth/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

// ── Passkey (WebAuthn) ───────────────────────────────────────────────────────

export interface PasskeyCredential {
  id: number;
  name: string;
  created_at: string;
}

export async function getPasskeyCredentials(): Promise<{
  count: number;
  credentials: PasskeyCredential[];
}> {
  const res = await fetch("/api/auth/passkey/credentials");
  if (!res.ok) return { count: 0, credentials: [] };
  return res.json() as Promise<{
    count: number;
    credentials: PasskeyCredential[];
  }>;
}

export async function deletePasskeyCredential(id: number): Promise<void> {
  const res = await fetch(`/api/auth/passkey/credentials/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new ApiError(res.status, {});
}

export async function registerPasskey(
  name = "My passkey",
): Promise<{ id: number; name: string }> {
  const { startRegistration } = await import("@simplewebauthn/browser");

  const optionsRes = await post("/api/auth/passkey/register/options");
  const { options, challenge_id } = (await optionsRes.json()) as {
    options: Parameters<typeof startRegistration>[0]["optionsJSON"];
    challenge_id: string;
  };

  const credential = await startRegistration({ optionsJSON: options });

  const verifyRes = await post("/api/auth/passkey/register/verify", {
    credential,
    challenge_id,
    name,
  });
  return verifyRes.json() as Promise<{ id: number; name: string }>;
}

export async function loginWithPasskey(email: string): Promise<void> {
  const { startAuthentication } = await import("@simplewebauthn/browser");

  const optionsRes = await post(
    "/api/auth/passkey/authenticate/options",
    { email },
    LoginError,
  );
  const { options, challenge_id } = (await optionsRes.json()) as {
    options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
    challenge_id: string;
  };

  const credential = await startAuthentication({ optionsJSON: options });

  await post(
    "/api/auth/passkey/authenticate/verify",
    { email, credential, challenge_id },
    LoginError,
  );
}
