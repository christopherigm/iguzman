import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { getTenantHost } from "@/lib/resolve-site";
import logger from "@/lib/logger";

/**
 * Price an anonymous visitor's localStorage cart and resolve their saved items.
 *
 * Deliberately **not** an `apiFetch` route: there is no session to attach and no
 * token to refresh. It is the browser's only way to turn the bare references it
 * holds into a renderable cart, and it forwards `X-Website-Host` for exactly the
 * reason every `lib/` data helper does - the Django side resolves the tenant
 * from that host, since an anonymous caller has no profile to read one off.
 *
 * The host comes from `getTenantHost()` (the resolved site's `systemHost`, else
 * the real request host), never from the request body: which tenant's catalog a
 * cart is priced against is not the browser's to choose.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const host = await getTenantHost();

  try {
    const res = await fetch(`${API_URL}/api/guest/resolve/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Website-Host": host },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    logger.error({ err, host }, "Failed to resolve guest cart");
    return NextResponse.json(
      { detail: "Could not load your cart." },
      { status: 502 },
    );
  }
}
