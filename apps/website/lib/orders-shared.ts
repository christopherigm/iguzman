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

// Type-only, so nothing from that module reaches a client bundle at runtime -
// though `booking-shared` is pure anyway, for the same reason this file is.
import type { Booking, BookingSummary } from "./booking-shared";

/** Mirrors `Order.STATUS_CHOICES` in website-api. `placed` is an offline order
 *  (pay-in-store / pay-on-delivery) awaiting the tenant to take payment - it
 *  never has a Stripe session, which is what keeps it apart from `pending`. */
export type OrderStatus =
  "pending" | "placed" | "paid" | "failed" | "canceled" | "refunded";

/** The methods a customer can pick for themselves at checkout. */
export type CustomerPaymentMethod = "online" | "in_store" | "on_delivery";

/** The two counter methods, rung up by an associate on the POS screen. They are
 *  not variants of `in_store` (a promise to pay at pickup): the customer is at
 *  the till, so the order is born and settled within a minute of itself. */
export type PosPaymentMethod = "terminal" | "cash";

/** Mirrors `Order.PAYMENT_METHOD_CHOICES` in website-api - every method an order
 *  can carry, whether it came from the storefront or the POS. Anything that
 *  renders one (a `method_*` / `placedNote_*` message, an icon map) must cover
 *  the counter methods too, or a POS order shows a raw key. */
export type PaymentMethod = CustomerPaymentMethod | PosPaymentMethod;

/**
 * One purchased line, served from the order's own snapshot rather than the
 * catalog - `name` and `unit_price` are what was actually charged, so they stay
 * correct after the item is re-priced or renamed.
 *
 * `image`, `item_id`, `item_slug` and `item_menu_kind` are the exception: they
 * are read through the catalog FK and go null once the item is deleted, which is
 * why the order page must render a line without them.
 */
/** One snapshotted customisation on a purchased menu line (see the API's
 *  OrderLine.customization). Frozen at checkout so it survives catalog edits. */
export interface OrderLineCustomization {
  name: string;
  quantity: number;
  unit_price: string;
  line_upcharge: string;
  removed: boolean;
}

export interface OrderLine {
  id: number;
  kind: "product" | "service" | "menu_item";
  name: string;
  sku: string;
  customization: OrderLineCustomization[];
  unit_price: string;
  quantity: number;
  line_total: string;
  currency: string;
  image: string | null;
  item_id: number | null;
  item_slug: string | null;
  /** A menu line's current category slug - the first segment of its detail
   *  route. Null for a product or service line, and null once the item is
   *  deleted; like `item_slug`, it addresses a page rather than recording what
   *  was bought, so it is read live and follows an item re-filed in the CMS.
   *  Both are needed to build the link, so a null here means the row renders
   *  without one. */
  item_menu_category_slug: string | null;
  /**
   * Whether this line's service is **still** sold as an appointment, which
   * decides what re-ordering it means: "Book again" through `/booking/<slug>`,
   * rather than a one-click re-add to the cart, because an appointment needs a
   * time and a place a cart line cannot hold.
   *
   * Read live like `item_slug` and for the same reason - it addresses a page as
   * the site is *now*. `false` for a product, a menu item, a deleted item, and a
   * service whose tenant has since turned booking off.
   */
  item_booking_enabled: boolean;
}

export interface Order {
  /** The public UUID the order is addressed by - never the sequential DB id. */
  public_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  /** Fulfillment is a separate axis from payment: an order can be handed over
   *  before or after it is marked paid. */
  fulfilled: boolean;
  currency: string;
  subtotal: string;
  /**
   * What a coupon took off, in the order's own currency - the **frozen amount**,
   * never the coupon's percentage. "0.00" on every order placed without one, so
   * a summary must test the number rather than the string's truthiness.
   */
  discount_amount: string;
  /**
   * The code that was honoured, snapshotted at checkout like `OrderLine.name`.
   * It outlives the coupon itself (`Order.coupon` is SET_NULL), so a deleted
   * campaign's orders still read back in full. Empty when none was used.
   */
  coupon_code: string;
  total: string;
  email: string;
  phone: string;
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
  /** Null on every ordinary order. Present, this order *is* an appointment and
   *  the page renders it as one - see `Booking` in website-api's orders app. */
  booking: Booking | null;
  /** Absolute URL of the order's stored QR code, which encodes this order's own
   *  public page. **Null on any order placed before the field existed**, so
   *  every render site has to handle its absence rather than assume one is
   *  there - see `orders/services/qr.py` in website-api. */
  qr_code: string | null;
}

/**
 * An order-history row: no full lines, matching what the list endpoint serves.
 * `line_images` is the one thing pulled off the lines - resolved image URLs for
 * a compact preview strip of the purchased items on the history card.
 */
export interface OrderSummary {
  public_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  fulfilled: boolean;
  currency: string;
  total: string;
  /** The coupon honoured on this order, or empty. Enough for a history row to
   *  show a chip beside the charged total. */
  coupon_code: string;
  created_at: string;
  paid_at: string | null;
  item_count: number;
  line_images: string[];
  /** Enough for the history card to show when and where, without the full
   *  appointment record. Null on an ordinary order. */
  booking: BookingSummary | null;
}

/**
 * The short, human-facing form of an order's public id: the first block of the
 * UUID, uppercased (e.g. "A1B2C3D4"). The full `public_id` is what the URL and
 * the API address the order by; this is only ever shown, never looked up.
 */
export function orderRef(publicId: string): string {
  return publicId.slice(0, 8).toUpperCase();
}
