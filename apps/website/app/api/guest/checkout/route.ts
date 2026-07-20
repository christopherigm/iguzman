import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { getTenantHost } from "@/lib/resolve-site";
import logger from "@/lib/logger";

/**
 * Start checkout for a visitor with no account.
 *
 * The sibling of `/api/auth/checkout`, and a pass-through for the same reason:
 * this app is multi-tenant, the Stripe account belongs to the `System`, and its
 * keys live encrypted in Django. Nothing here touches a Stripe credential.
 *
 * It differs from the signed-in route in exactly two ways - there is no token to
 * attach (hence plain `fetch`, not `apiFetch`), and the body carries the
 * localStorage cart because there are no rows to read it from. Those references
 * name *which* items and nothing else: Django re-reads every price out of the
 * tenant's catalog before it creates a session, so a forged body can change what
 * is bought but never what it costs.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const host = await getTenantHost();

  try {
    const res = await fetch(`${API_URL}/api/orders/checkout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Website-Host": host },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    logger.error({ err, host }, "Failed to start guest checkout");
    return NextResponse.json(
      { detail: "Could not start checkout.", code: "STRIPE_ERROR" },
      { status: 502 },
    );
  }
}
