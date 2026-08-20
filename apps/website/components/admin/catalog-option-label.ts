/**
 * How a catalog record reads inside a CMS `<select>`.
 *
 * Three admin surfaces offer the whole catalog in one dropdown - the coupon
 * scope picker, the spotlight/flyer `CatalogRefPicker` and the social-post item
 * picker - and all three used to label a row with its **family**
 * ("Products · Black tee"). That is the one thing an operator scanning a list of
 * two hundred rows already knows and cannot use: what actually tells two
 * similarly-named rows apart is the category they are filed under.
 *
 * So an item reads **family glyph, category, name**:
 *
 * ```
 * 📦  T-shirts · Black tee
 * 🍽️  Pizzas · Margherita
 * 🛠️  Services · House call     ← uncategorized: the family label stands in
 * ```
 *
 * The glyph keeps the family visible for free (the emoji costs no width and no
 * translation), the category is the part that discriminates, and a row with no
 * category falls back to its family label rather than dropping the prefix - a
 * bare name in a column of prefixed ones reads as a rendering slip.
 *
 * ⚠ **The category name is the row's own `category_name`, not a second fetch.**
 * All three admin list payloads (`ProductSerializer`, `ServiceSerializer`,
 * `MenuItemSerializer`) already carry it, so this costs nothing; resolving it
 * against a separately-fetched category list would be a second source of truth
 * about where a row is filed.
 */

/**
 * Every kind these pickers speak, including the two spellings of the menu
 * family - `food` in the spotlight/social refs, `menu_item` in a coupon scope -
 * and the three category kinds, which wear their family's glyph.
 */
export type CatalogOptionKind =
  | "product"
  | "service"
  | "food"
  | "menu_item"
  | "product_category"
  | "service_category"
  | "menu_category";

export const CATALOG_KIND_ICON: Record<CatalogOptionKind, string> = {
  product: "📦",
  service: "🛠️",
  food: "🍽️",
  menu_item: "🍽️",
  product_category: "📦",
  service_category: "🛠️",
  menu_category: "🍽️",
};

/**
 * The row's category, trimmed, or `""` when it has none - which is what the
 * caller's family label is for. `category_name` is null on an uncategorized
 * product or service, and cannot be null on a menu item (the FK is required).
 */
export function catalogRowCategory(row: Record<string, unknown>): string {
  const name = row.category_name;
  return typeof name === "string" ? name.trim() : "";
}

/**
 * `📦  T-shirts · Black tee`.
 *
 * `prefix` is the category name when there is one and the family label
 * otherwise; the caller owns that choice because only it can translate the
 * family. An empty prefix draws glyph + name rather than a dangling separator.
 */
export function catalogOptionLabel(
  kind: CatalogOptionKind,
  prefix: string,
  name: string,
): string {
  const icon = CATALOG_KIND_ICON[kind];
  return prefix ? `${icon}  ${prefix} · ${name}` : `${icon}  ${name}`;
}
