/**
 * Client-safe order types and the pure `orderRef` display helper, split out of
 * `lib/orders.ts`.
 *
 * `lib/orders.ts` imports `apiFetch`, which pulls in the server-only chain that
 * ends at `next/headers` (`lib/metadata.ts`). A `"use client"` component that
 * imports a *runtime value* from that module drags the whole server graph into
 * its bundle and the build fails ("next/headers ... only available in Server
 * Components"). Type-only imports are erased and are safe; `orderRef` is not, so
 * it lives here where nothing server-only can follow it into a client bundle.
 *
 * `lib/orders.ts` re-exports everything here, so server code keeps importing
 * these from `@/lib/orders` unchanged.
 */

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
  /** The public UUID the order is addressed by - never the sequential DB id. */
  public_id: string;
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

/**
 * An order-history row: no full lines, matching what the list endpoint serves.
 * `line_images` is the one thing pulled off the lines - resolved image URLs for
 * a compact preview strip of the purchased items on the history card.
 */
export interface OrderSummary {
  public_id: string;
  status: OrderStatus;
  currency: string;
  total: string;
  created_at: string;
  paid_at: string | null;
  item_count: number;
  line_images: string[];
}

/**
 * The short, human-facing form of an order's public id: the first block of the
 * UUID, uppercased (e.g. "A1B2C3D4"). The full `public_id` is what the URL and
 * the API address the order by; this is only ever shown, never looked up.
 */
export function orderRef(publicId: string): string {
  return publicId.slice(0, 8).toUpperCase();
}
