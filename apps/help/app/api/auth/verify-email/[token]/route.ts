import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/verify-email/[token] - redeem a verification link, and sign the
 * user in with it.
 *
 * Redeeming the link proves the recipient controls that address, which is at
 * least as strong as the password login this used to send them off to, so the
 * API returns a token pair alongside the verification and this opens the session
 * on the spot.
 *
 * ⚠ **The tokens must be stripped from the body**, exactly as the passkey
 * authenticate handler does: they belong in the HTTP-only cookies and nowhere
 * else. Returning the API's response verbatim - which is what this did before
 * the API started minting a pair here - would hand a JWT to browser JavaScript.
 *
 * The other frontends share `verifyEmailRoute` from `@repo/auth`; this app still
 * carries its own copy of the auth stack, so the logic is duplicated here.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const res = await fetch(
    `${process.env.API_URL}/api/auth/verify-email/${encodeURIComponent(token)}/`,
  );
  const { access, refresh, ...data } = (await res.json().catch(() => ({}))) as {
    access?: unknown;
    refresh?: unknown;
  } & Record<string, unknown>;

  if (!res.ok) return NextResponse.json(data, { status: res.status });

  if (typeof access !== "string" || typeof refresh !== "string") {
    return NextResponse.json({ ...data, signed_in: false });
  }

  const isProduction = process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
  };
  const cookieStore = await cookies();
  cookieStore.set("access_token", access, { ...cookieOpts, maxAge: 60 * 60 });
  cookieStore.set("refresh_token", refresh, {
    ...cookieOpts,
    maxAge: 60 * 60 * 24 * 7,
  });
  return NextResponse.json({ ...data, signed_in: true });
}
