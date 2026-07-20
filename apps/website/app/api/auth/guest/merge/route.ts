import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Fold a just-signed-in visitor's localStorage cart and favorites into their
 * account's rows. Union, with quantities summed.
 *
 * Authenticated, so it goes through `apiFetch` - and unlike the guest routes
 * beside it, the tenant is taken from the account's profile on the Django side,
 * never from a host header: which tenant a signed-in cart merges into is the one
 * thing here a browser must not be able to pick.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  const res = await apiFetch("/api/auth/guest/merge/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
