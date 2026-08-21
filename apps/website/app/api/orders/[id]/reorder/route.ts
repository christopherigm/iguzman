import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";
import { getTenantHost } from "@/lib/resolve-site";

/**
 * Put a past order back in the cart.
 *
 * A pass-through like `pay/` beside it, and gated the same way. The body is
 * empty on purpose: which items, which sizes and which ingredients are read off
 * the order's own frozen lines server-side, exactly as checkout reads a cart -
 * a client that could name a line could name one the customer never bought.
 *
 * `allowAnonymous` + `X-Website-Host`, as `getOrder` and the booking checkout
 * do: a guest order has no owner to authenticate as, and with no token Django
 * needs the host to know whose order is being asked for. It still refuses an
 * *owned* order to anyone but its owner, and answers a guest with the resolved
 * references rather than writing a cart there is no account to hold.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const host = await getTenantHost();

  const res = await apiFetch(`/api/orders/${id}/reorder/`, {
    method: "POST",
    allowAnonymous: true,
    headers: { "Content-Type": "application/json", "X-Website-Host": host },
    body: "{}",
  });

  const data: unknown = await res.json().catch(() => ({
    detail: "Could not re-order.",
  }));
  return NextResponse.json(data, { status: res.status });
}
