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
import logger from "./logger";

/** Mirrors `Order.STATUS_CHOICES` in website-api. */
export type OrderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "canceled"
  | "refunded";

/**
 * One purchased line, served from the order's own snapshot rather than the
 * catalog - `name` and `unit_price` are what was actually charged, so they stay
 * correct after the item is re-priced or renamed.
 *
 * `image`, `item_id` and `item_slug` are the exception: they are read through
 * the catalog FK and go null once the item is deleted, which is why the order
 * page must render a line without them.
 */
export interface OrderLine {
  id: number;
  kind: "product" | "service";
  name: string;
  variant_label: string;
  sku: string;
  unit_price: string;
  quantity: number;
  line_total: string;
  currency: string;
  image: string | null;
  item_id: number | null;
  item_slug: string | null;
}

export interface Order {
  id: number;
  status: OrderStatus;
  currency: string;
  subtotal: string;
  total: string;
  email: string;
  shipping_name: string;
  shipping_line1: string;
  shipping_line2: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
  created_at: string;
  paid_at: string | null;
  item_count: number;
  lines: OrderLine[];
}

/** An order-history row: no lines, matching what the list endpoint serves. */
export interface OrderSummary {
  id: number;
  status: OrderStatus;
  currency: string;
  total: string;
  created_at: string;
  paid_at: string | null;
  item_count: number;
}

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
export async function getOrder(id: number): Promise<Order | null> {
  if ((await getSession()) === null) return null;

  try {
    const res = await apiFetch(`/api/orders/${id}/`, { cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 401 && res.status !== 404) {
        logger.warn({ status: res.status, id }, "Order API returned non-OK status");
      }
      return null;
    }
    return (await res.json()) as Order;
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err, id }, "Failed to fetch order");
    return null;
  }
}
