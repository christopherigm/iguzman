import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";
import { getTenantHost } from "@/lib/resolve-site";

/**
 * Reopen checkout on an order that already exists, for the customer who reached
 * Stripe and came back without paying.
 *
 * A pass-through like the two checkout routes, and for the same reason: this app
 * is multi-tenant, the Stripe account belongs to the `System`, and its keys live
 * encrypted in Django. Nothing here touches a credential and nothing here names
 * an amount - the API charges the order's own frozen lines, so the body carries
 * only the locale the return URLs should come back to.
 *
 * `allowAnonymous` + `X-Website-Host`, exactly as `getOrder` and the booking
 * checkout do: a guest order has no owner to authenticate as, and with no token
 * Django needs the host to know which tenant's order is being asked for. Django
 * still refuses an *owned* order to anyone but its owner.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body: unknown = await request.json().catch(() => ({}));
  const host = await getTenantHost();

  const res = await apiFetch(`/api/orders/${id}/pay/`, {
    method: "POST",
    allowAnonymous: true,
    headers: { "Content-Type": "application/json", "X-Website-Host": host },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json().catch(() => ({
    detail: "Could not start checkout.",
  }));
  return NextResponse.json(data, { status: res.status });
}
