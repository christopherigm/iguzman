import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";
import { getTenantHost } from "@/lib/resolve-site";

/**
 * Check a typed coupon code against the customer's live basket.
 *
 * **One route for guests and signed-in customers alike**, like
 * `/api/booking/checkout` and for the same reason: with a token Django reads the
 * caller's own cart rows, and without one it prices the `cart` references the
 * body carries - the request shape is identical either way, so `allowAnonymous`
 * plus `X-Website-Host` covers both rather than a split pair of handlers.
 *
 * ⚠ **This answers a question; it does not reserve anything.** No redemption is
 * held and no row is written, so a code that passes here can still be refused a
 * moment later if someone else takes the last redemption. Checkout re-validates
 * and is the only thing that may consume one - which is why nothing in the
 * browser is allowed to carry the discount forward as a number. The reply's
 * amounts are for display; the order is priced again server-side.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const host = await getTenantHost();

  const res = await apiFetch("/api/coupons/validate/", {
    method: "POST",
    allowAnonymous: true,
    headers: { "Content-Type": "application/json", "X-Website-Host": host },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json().catch(() => ({
    detail: "Could not check that coupon.",
    code: "COUPON_ERROR",
  }));
  return NextResponse.json(data, { status: res.status });
}
