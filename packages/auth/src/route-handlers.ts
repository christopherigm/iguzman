import { NextRequest, NextResponse } from "next/server";
import { apiFetch, clearAuthCookies, setAuthCookies } from "./api-fetch";
import { apiUrl } from "./tokens";

/**
 * The `/api/auth/*` route handlers that are the same in every frontend.
 *
 * A `route.ts` file has to live inside an app's `app/` tree, so the handler
 * itself is what gets shared: each app's route file is one line binding the
 * handler to its HTTP method, e.g.
 *
 *     export { logoutRoute as POST } from "@repo/auth/route-handlers";
 *
 * Only the genuinely identical ones live here. Login, signup, profile and the
 * passkey verify handlers differ per app (website injects `system_id`,
 * edge-folio carries extra profile fields), so those stay in their apps.
 */

/** POST /api/auth/logout - drop both token cookies. */
export async function logoutRoute(): Promise<NextResponse> {
  await clearAuthCookies();
  return NextResponse.json({ ok: true });
}

/**
 * GET /api/auth/verify-email/[token] - redeem a verification link, and sign the
 * user in with it.
 *
 * Redeeming the link proves the recipient controls that address, which is at
 * least as strong as the password login the old flow sent them off to - so the
 * APIs return a token pair alongside the verification and this opens the session
 * on the spot. A customer who clicks the link in their inbox lands signed in,
 * instead of on a sign-in form for an account they have just proved is theirs.
 *
 * **The tokens are moved into the HTTP-only cookies and stripped from the body.**
 * The browser never sees a JWT - the response says only whether a session was
 * opened, which is the invariant the whole package rests on.
 *
 * An API that does not mint tokens here yields `signed_in: false` and the page
 * falls back to its previous "you can now sign in" copy, so this is safe to bind
 * before the backend it talks to has been updated.
 */
export async function verifyEmailRoute(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // Deliberately not `apiFetch`: verification is what *creates* the session, so
  // there is no access token to attach and a logged-out caller must not be
  // short-circuited to 401.
  let res: Response;
  try {
    res = await fetch(
      `${apiUrl()}/api/auth/verify-email/${encodeURIComponent(token)}/`,
    );
  } catch {
    return NextResponse.json(
      { detail: "Service unavailable" },
      { status: 503 },
    );
  }

  const { access, refresh, ...data } = (await res.json().catch(() => ({}))) as {
    access?: unknown;
    refresh?: unknown;
  } & Record<string, unknown>;

  if (!res.ok) return NextResponse.json(data, { status: res.status });

  if (typeof access === "string" && typeof refresh === "string") {
    await setAuthCookies(access, refresh);
    return NextResponse.json({ ...data, signed_in: true });
  }
  return NextResponse.json({ ...data, signed_in: false });
}

/** POST /api/auth/change-password */
export async function changePasswordRoute(
  request: NextRequest,
): Promise<NextResponse> {
  const body: unknown = await request.json();
  const res = await apiFetch("/api/auth/change-password/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** GET /api/auth/passkey/credentials */
export async function listPasskeyCredentialsRoute(): Promise<NextResponse> {
  const res = await apiFetch("/api/auth/passkey/credentials/");
  if (!res.ok) return NextResponse.json({ count: 0, credentials: [] });
  const data: unknown = await res.json();
  return NextResponse.json(data);
}

/** DELETE /api/auth/passkey/credentials/[id] */
export async function deletePasskeyCredentialRoute(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const res = await apiFetch(`/api/auth/passkey/credentials/${id}/`, {
    method: "DELETE",
  });
  return new NextResponse(null, { status: res.status });
}

/** POST /api/auth/profile/picture */
export async function uploadProfilePictureRoute(
  request: NextRequest,
): Promise<NextResponse> {
  const body: unknown = await request.json();
  const res = await apiFetch("/api/auth/profile/picture/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
