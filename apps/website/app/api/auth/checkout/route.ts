import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Start checkout: hand the cart to Django, get back a Stripe Checkout URL.
 *
 * A pass-through by design. Unlike video-downloader's `/api/credits/purchase`,
 * which builds the Stripe session here, this app is multi-tenant: the Stripe
 * account belongs to the `System`, and its keys live encrypted in Django (see
 * `core.crypto`). Creating the session here would mean shipping a decrypted
 * per-tenant secret key into the Next process on every checkout - the same
 * reasoning that moved the LLM keys out of this app (see website/CLAUDE.md).
 *
 * The body carries only a locale. Items, prices and currency are read from the
 * user's cart server-side, so nothing the browser says can change the amount.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  const res = await apiFetch("/api/orders/checkout/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
