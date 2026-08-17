/**
 * The POS basket: what a store associate has rung up but not yet charged.
 *
 * This is the counter-side twin of `lib/guest-cart.ts`, and it follows the same
 * rule for the same reason: **the basket holds references and display copies,
 * never an authoritative price.** `POST /api/orders/admin/pos/` re-reads every
 * line out of the tenant's catalog and prices it there, so the numbers below are
 * only what the associate and the customer read off the screen. If the two ever
 * disagreed, the server's answer is the one that is charged.
 *
 * Unlike the guest cart this is **not** persisted. A counter sale lives for the
 * ninety seconds between ringing it up and taking the money; writing it to
 * localStorage would mostly serve to resurrect a half-finished sale from
 * yesterday's shift onto today's screen.
 */
import type { MenuItemIngredient, MenuSize } from "./catalog";
import type { CustomizationRow } from "./menu-selection";

export type PosKind = "product" | "service" | "menu_item";

/**
 * One sellable thing on the POS grid: the three catalog families flattened into
 * the handful of fields a till needs, resolved to the operator's locale by the
 * server page so no component has to re-do that per tile.
 *
 * `ingredients` is empty for products and services, and for menu items the
 * tenant has not made configurable - the customiser only opens when it isn't.
 */
export interface PosCatalogItem {
  kind: PosKind;
  id: number;
  name: string;
  image: string | null;
  price: string;
  currency: string;
  available: boolean;
  /** Menu category name, when the item has one. Drives the POS category chips;
   *  products and services carry none. */
  category: string | null;
  ingredients: MenuItemIngredient[];
  /** A menu item's effective sizes, as the API resolved them (own rows else its
   *  category's). Empty for products, services, and dishes sold in one size. */
  sizes: MenuSize[];
}

/**
 * One line in the basket.
 *
 * `key` is the line's handle, not `id`: the same menu item configured two ways
 * is two lines, exactly as it is in a cart, so the catalog id cannot identify a
 * row on its own.
 */
export interface PosLine {
  key: string;
  kind: PosKind;
  id: number;
  name: string;
  image: string | null;
  /** The item's own list price. The chosen size's delta and the add-on deltas are
   *  in `upcharge`, not folded in here, so the basket can show what the
   *  customisation added. */
  basePrice: number;
  upcharge: number;
  currency: string;
  quantity: number;
  /** The chosen size's id, for the API payload, and its name for the basket row.
   *  Both absent for a dish sold in one size. */
  size?: number;
  sizeName?: string;
  /** The API payload: which ingredients, in what quantity - never a price. */
  customization: CustomizationRow[];
  /** Human-readable add-on summary for the basket row, e.g. ["Extra queso ×2"].
   *  Display only; the server rebuilds its own snapshot from `customization`. */
  customizationLabels: string[];
}

/** What one unit of a line costs, as shown on screen. */
export function lineUnitPrice(line: PosLine): number {
  return line.basePrice + line.upcharge;
}

export function lineTotal(line: PosLine): number {
  return lineUnitPrice(line) * line.quantity;
}

export function basketTotal(lines: PosLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export function basketCount(lines: PosLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * The currencies present in the basket.
 *
 * An order carries exactly one currency (the API refuses a mixed basket with
 * `MIXED_CURRENCY`), so the POS checks here and says so before the associate has
 * the customer's card in their hand rather than after.
 */
export function basketCurrencies(lines: PosLine[]): string[] {
  return [...new Set(lines.map((line) => line.currency))];
}

/**
 * What makes two rung-up lines the same basket row: the item plus its exact size
 * and customisation. Two identically configured items merge into one row with
 * quantity 2; the same item in a different size, or with different add-ons, stays
 * two rows - they are two different things at two different prices.
 *
 * The customisation is sorted before stringifying because the rows are built by
 * iterating the ingredient list, and a reordered but equal selection must not
 * read as a different line.
 */
export function lineKey(
  kind: PosKind,
  id: number,
  customization: CustomizationRow[],
  size?: number,
): string {
  const normalized = [...customization]
    .sort((a, b) => a.ingredient - b.ingredient)
    .map((row) => `${row.ingredient}:${row.quantity}:${row.option ?? ""}`)
    .join(",");
  return `${kind}:${id}:${size ?? ""}:${normalized}`;
}

/** Add a line, merging it into an identical existing row rather than stacking a
 *  duplicate - what a till does when the same thing is scanned twice. */
export function addLine(lines: PosLine[], incoming: PosLine): PosLine[] {
  const existing = lines.find((line) => line.key === incoming.key);
  if (!existing) return [...lines, incoming];
  return lines.map((line) =>
    line.key === incoming.key
      ? { ...line, quantity: line.quantity + incoming.quantity }
      : line,
  );
}

/** Re-quantify a row, dropping it when it reaches zero. */
export function setLineQuantity(
  lines: PosLine[],
  key: string,
  quantity: number,
): PosLine[] {
  if (quantity <= 0) return lines.filter((line) => line.key !== key);
  return lines.map((line) => (line.key === key ? { ...line, quantity } : line));
}

/** The basket as the API's `cart` payload: references and quantities only. */
export function toCartPayload(lines: PosLine[]) {
  return lines.map((line) => ({
    kind: line.kind,
    id: line.id,
    quantity: line.quantity,
    size: line.size,
    customization: line.customization,
  }));
}
