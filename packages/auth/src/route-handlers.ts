import { NextRequest, NextResponse } from "next/server";
import { apiFetch, clearAuthCookies } from "./api-fetch";

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
