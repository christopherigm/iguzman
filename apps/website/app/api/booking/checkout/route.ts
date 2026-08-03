import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";
import { getTenantHost } from "@/lib/resolve-site";

/**
 * Book an appointment: hand the chosen service, place and slot to Django, and
 * get back either a Stripe Checkout URL (paying now) or a redirect to the order
 * (paying in person).
 *
 * A pass-through, for the same reason cart checkout is one: this app is
 * multi-tenant, the Stripe account belongs to the `System`, and its keys live
 * encrypted in Django. Nothing here touches a Stripe credential, and nothing
 * here decides an amount - the body names *which* service and *when*, and the
 * API prices it off the catalog and re-derives the slot before writing anything.
 *
 * **One route for guests and signed-in customers alike**, unlike cart checkout's
 * `/api/auth/checkout` + `/api/guest/checkout` pair. Those are split because a
 * guest's cart has to travel in the body while a signed-in cart is read from
 * rows - a booking has no such difference, the body is identical either way. So
 * this uses `allowAnonymous` and sends `X-Website-Host` alongside: with a token
 * Django takes the tenant from the profile, and without one it falls back to the
 * host, exactly as `getOrder` does for a guest order.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const host = await getTenantHost();

  const res = await apiFetch("/api/bookings/checkout/", {
    method: "POST",
    allowAnonymous: true,
    headers: { "Content-Type": "application/json", "X-Website-Host": host },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json().catch(() => ({
    detail: "Could not complete the booking.",
  }));
  return NextResponse.json(data, { status: res.status });
}
