/**
 * The signed-in user's orders.
 *
 * The reasoning here is `lib/cart.ts`'s, and the three (cart, favorites, orders)
 * must stay in step: these read through `apiFetch`, are safe to call from a
 * server component because `createAuthProxy` has already refreshed an expired
 * access token earlier in the same request, and degrade to empty rather than a
 * 500 when the API is unreachable.
 *
 * Each catch must call `unstable_rethrow` first. Next signals "this route read
 * cookies, so it cannot be prerendered" by *throwing*; swallowing that tells the
 * build the route rendered fine with no orders, and it gets baked into a static
 * page that shows every user an empty history forever.
 */
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getSession } from "@repo/auth/session";
import { apiFetch } from "./api-fetch";
import type { Order, OrderSummary } from "./orders-shared";
import logger from "./logger";

// The order types and the pure `orderRef` helper live in `./orders-shared` so a
// client component can use them without importing this server-only module (which
// pulls in `apiFetch` → `next/headers`). Re-exported here so existing callers
// keep importing them from `@/lib/orders`.
export * from "./orders-shared";

export const getOrders = cache(async (): Promise<OrderSummary[]> => {
  if ((await getSession()) === null) return [];

  try {
    const res = await apiFetch("/api/orders/", { cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 401) {
        logger.warn({ status: res.status }, "Orders API returned non-OK status");
      }
      return [];
    }
    return (await res.json()) as OrderSummary[];
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err }, "Failed to fetch orders");
    return [];
  }
});

/**
 * One order in full, or null when it does not exist *for this user* - Django
 * scopes the lookup to the caller, so another user's id is simply a 404.
 *
 * Not wrapped in `cache()` across requests on purpose: the confirmation page
 * re-reads this while the Stripe webhook is still in flight, and a cached
 * `pending` would outlive the payment it is waiting for.
 */
export async function getOrder(publicId: string): Promise<Order | null> {
  if ((await getSession()) === null) return null;

  try {
    const res = await apiFetch(`/api/orders/${publicId}/`, { cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 401 && res.status !== 404) {
        logger.warn(
          { status: res.status, publicId },
          "Order API returned non-OK status",
        );
      }
      return null;
    }
    return (await res.json()) as Order;
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err, publicId }, "Failed to fetch order");
    return null;
  }
}
