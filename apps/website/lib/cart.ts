/**
 * The signed-in user's cart.
 *
 * The reasoning here is `lib/favorites.ts`'s, and the two must stay in step: these
 * read through `apiFetch`, are safe to call from a server component because
 * `createAuthProxy` has already refreshed an expired access token earlier in the
 * same request, and degrade to an empty cart rather than a 500 when the API is
 * unreachable.
 *
 * Each catch must call `unstable_rethrow` first. Next signals "this route read
 * cookies, so it cannot be prerendered" by *throwing*; swallowing that tells the
 * build the route rendered fine with an empty cart, and it gets baked into a
 * static page that shows every user an empty cart forever.
 */
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getSession } from "@repo/auth/session";
import { apiFetch } from "./api-fetch";
import type {
  FeaturedProduct,
  FeaturedService,
  MenuItemDetail,
  MenuSize,
} from "./catalog";
import logger from "./logger";

/**
 * One chosen ingredient on a menu line, resolved server-side to a label and its
 * up-charge so the cart can render it without re-reading the catalog. `removed`
 * marks a default ingredient the customer took off.
 */
export interface CartCustomizationRow {
  ingredient: number;
  name: string;
  en_name: string | null;
  quantity: number;
  /**
   * The alternative swapped in from a choice group (an `Ingredient` id), null
   * when the group's default was kept.
   *
   * The row's `name` is what the cart *prints*; this is what the picker
   * *selects on*, and a name cannot be turned back into an id - so without it
   * re-opening the customiser on this line would offer the default in place of
   * the option the customer actually chose.
   */
  option: number | null;
  unit_price: string;
  line_upcharge: string;
  removed: boolean;
}

/**
 * One line of the cart. `unit_price` and `line_total` are resolved server-side,
 * so nothing here has to re-derive a price from the catalog payload; they are
 * strings, matching every other price in this API.
 */
export type CartItem = {
  id: number;
  quantity: number;
  created_at: string;
  /** The chosen size, resolved server-side. Null for a product, a service, or a
   *  dish sold in one size. Read live through the FK, unlike an *order* line's,
   *  which is snapshotted - a cart reflects today's catalog. */
  size: MenuSize | null;
  customization: CartCustomizationRow[];
  unit_price: string;
  line_total: string;
  currency: string;
  in_stock: boolean;
  /**
   * What this line costs in points, or null when it cannot be redeemed - which
   * is also what every line reads on a tenant with the program off, so the
   * cart's money/points button pair simply never appears.
   */
  points_price: number | null;
  /**
   * Whether the customer has chosen to pay for this line with points.
   *
   * ⚠ Reported false whenever the line could not actually be redeemed, even if
   * the stored flag says otherwise - the tenant may have cleared the item's
   * points price while the line sat in the basket. So this is safe to paint a
   * selected button from; it never says "points" for a line checkout will charge
   * in money.
   */
  pay_with_points: boolean;
} & (
  | { kind: "product"; item: FeaturedProduct }
  | { kind: "service"; item: FeaturedService }
  | { kind: "menu_item"; item: MenuItemDetail }
);

/** A subtotal, per currency: `Buyable.currency` is per item, so a cart can hold
 *  more than one and summing across them would be meaningless. */
export interface CartTotal {
  currency: string;
  subtotal: string;
}

/**
 * One "don't forget this" card under the cart's lines.
 *
 * A **full** item payload, not a reference, because the strip is drawn with the
 * ordinary catalog card - the add button, the heart, the customiser and the
 * price all have to behave exactly as they do in a grid, since adding one of
 * these to the cart is the whole point.
 *
 * ⚠ Nothing here is filtered on the client. The API has already deduped across
 * lines, dropped anything already in the cart, dropped what cannot be bought,
 * and dropped anything in a currency this basket cannot check out in - see
 * website-api's `catalog/recommendations.py`. Re-deriving any of that in the
 * browser is how the strip comes to disagree with the cart it sits under.
 */
export type CartRecommendation =
  | { kind: "product"; item: FeaturedProduct }
  | { kind: "service"; item: FeaturedService }
  | { kind: "menu_item"; item: MenuItemDetail };

/**
 * The cart's points position: the balance, what the current selection costs, and
 * the money it displaces.
 *
 * ⚠ Resolved server-side over the **whole** basket, because affordability is a
 * question about every redeemed line against one balance and no single line can
 * answer it. Re-deriving `affordable` in the browser is how the cart comes to
 * disagree with the checkout it sits above.
 *
 * `enabled` is false for a guest whatever the tenant has switched on: there is
 * no account to hold a balance, which is exactly what the disabled points button
 * says.
 */
export interface CartRewards {
  enabled: boolean;
  balance: number;
  /** Points the current selection would spend. */
  points_used: number;
  /**
   * The money those lines would otherwise have cost - the "equivalent in money"
   * the summary prints. It is the sum of the displaced line totals and **never a
   * conversion rate**: points are priced per item, so there is no single rate to
   * convert at.
   */
  points_value: string;
  /** Whether the balance covers `points_used`. Advisory - checkout re-checks it
   *  under a lock, since the balance moves while the page is open. */
  affordable: boolean;
}

export interface Cart {
  items: CartItem[];
  /** Total quantity, not line count - what the navbar shows. */
  count: number;
  totals: CartTotal[];
  /**
   * The extras to offer beneath the lines. Empty for an empty cart, and empty
   * whenever the tenant has configured none.
   *
   * It rides on the cart payload rather than having its own endpoint, which is
   * what makes it self-maintaining: every cart write invalidates this payload,
   * so adding a recommended item drops it from the next render with no
   * client-side bookkeeping at all.
   */
  recommendations: CartRecommendation[];
  /**
   * ⚠ **`totals` above already excludes every redeemed line**, matching what
   * checkout will charge. Don't subtract `rewards.points_value` from a subtotal
   * again - the summary prints it as a *statement* of what the points covered,
   * not as a deduction still to be applied.
   */
  rewards: CartRewards;
}

/**
 * One line, stripped to what a card needs to recognise itself in the cart.
 *
 * `line_id` is the CartItem row's own id - the thing `DELETE /api/auth/cart/[id]`
 * takes - which is why this cannot be a list of catalog ids the way `FavoriteIds`
 * is. A variant is its own catalog item, so the same family in two sizes is two
 * lines with two different `id`s.
 */
export interface CartLineRef {
  line_id: number;
  kind: "product" | "service" | "menu_item";
  id: number;
  /**
   * A menu line with a non-default ingredient selection **or** a chosen size.
   * Always false for product/service. The card adds/removes only the base
   * (default) line, so it matches on `!customized` and leaves customised siblings
   * alone - a sized line always counts, because a card offering "remove" could
   * not say which size it would take out of the cart.
   */
  customized: boolean;
}

const EMPTY_CART: Cart = {
  items: [],
  count: 0,
  totals: [],
  recommendations: [],
  // The "off" shape, matching what a guest's resolved cart carries, so every
  // consumer reads one type and no caller has to guard against a missing block
  // on the degraded path.
  rewards: {
    enabled: false,
    balance: 0,
    points_used: 0,
    points_value: "0.00",
    affordable: true,
  },
};

export const getCart = cache(async (): Promise<Cart> => {
  if ((await getSession()) === null) return EMPTY_CART;

  try {
    const res = await apiFetch("/api/auth/cart/", { cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 401) {
        logger.warn({ status: res.status }, "Cart API returned non-OK status");
      }
      return EMPTY_CART;
    }
    return (await res.json()) as Cart;
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err }, "Failed to fetch cart");
    return EMPTY_CART;
  }
});

/**
 * Just the total quantity, for the navbar badge. The navbar renders on every
 * page, and fetching the full cart to print one number would pull every line's
 * images on every navigation - the same reasoning as
 * `getFavoriteIds`.
 */
export const getCartCount = cache(async (): Promise<number> => {
  // An anonymous visitor has no cart, and the navbar asks on every page.
  if ((await getSession()) === null) return 0;

  try {
    const res = await apiFetch("/api/auth/cart/count/", { cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 401) {
        logger.warn(
          { status: res.status },
          "Cart count API returned non-OK status",
        );
      }
      return 0;
    }
    const data = (await res.json()) as { count: number };
    return data.count;
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err }, "Failed to fetch cart count");
    return 0;
  }
});

/**
 * The cart as bare line references, for the catalog cards' in-cart check - the
 * same trade as `getFavoriteIds`: a grid of N cards asks N times, and answering
 * each from the full cart would pull every line's images.
 */
export const getCartLines = cache(async (): Promise<CartLineRef[]> => {
  // An anonymous visitor has no cart, and every card asks. Without this the
  // whole catalog costs one round-trip that can only come back 401.
  if ((await getSession()) === null) return [];

  try {
    const res = await apiFetch("/api/auth/cart/ids/", { cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 401) {
        logger.warn(
          { status: res.status },
          "Cart ids API returned non-OK status",
        );
      }
      return [];
    }
    const data = (await res.json()) as { lines: CartLineRef[] };
    return data.lines;
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err }, "Failed to fetch cart ids");
    return [];
  }
});

/**
 * The id of the cart line for exactly this item, or null when it is not in the
 * cart. A sibling variant is its own catalog item, so a card reads only its own
 * line - a different variant of the same family sitting in the cart correctly
 * leaves this one showing as "not in cart".
 *
 * For `menu_item` the identity also includes the ingredient selection: the card
 * only adds/removes the base (default-ingredients) line, so it matches the
 * uncustomised line and ignores any customised siblings in the cart.
 */
export async function findCartLineId(
  kind: "product" | "service" | "menu_item",
  id: number,
): Promise<number | null> {
  const lines = await getCartLines();
  const match = lines.find((line) => {
    if (line.kind !== kind || line.id !== id) return false;
    return kind === "menu_item" ? !line.customized : true;
  });
  return match?.line_id ?? null;
}
