/**
 * What a menu item *is*, and where each kind is listed.
 *
 * Deliberately its own module rather than part of `lib/catalog.ts`: the navbar
 * is a **client** component and needs these constants, while `catalog.ts`
 * reaches `next/headers` through `resolve-site.ts` to resolve the tenant. One
 * import of a path constant from `catalog.ts` therefore pulls server-only code
 * into the browser bundle and fails the build. Nothing here may import a server
 * module - keep it plain data.
 */

/** Mirrors `MENU_ITEM_KIND_CHOICES` in `catalog/models.py` - the API's `?kind=`
 *  filter accepts the same values. Note the two axes in one enum: `drink` is
 *  beverage-vs-food while the rest are courses, so "everything edible" is
 *  `kind !== "drink"`, not `kind === "food"`. */
export type MenuItemKind =
  | "food"
  | "drink"
  | "dessert"
  | "side"
  | "appetizer";

/** Every kind, in the order a menu reads: dishes, then what goes around them.
 *  Drives the navbar's Menu dropdown and the section order on `/categories/menu`,
 *  so both follow one list instead of two hand-kept copies. */
export const MENU_ITEM_KINDS: MenuItemKind[] = [
  "food",
  "appetizer",
  "side",
  "dessert",
  "drink",
];

/** The public listing page for each kind. The path is plural and the enum
 *  value singular ("drink" -> /categories/drinks), so never build one by
 *  concatenation - read it here. `MENU_ALL_PATH` is the whole menu; each of
 *  these shows one kind. */
export const MENU_KIND_PATHS: Record<MenuItemKind, string> = {
  food: "/categories/food",
  drink: "/categories/drinks",
  dessert: "/categories/desserts",
  side: "/categories/sides",
  appetizer: "/categories/appetizers",
};

/** Path of the page listing the tenant's whole menu, every kind together. */
export const MENU_ALL_PATH = "/categories/menu";

/** All-zero per-kind counts - what an unresolved host (no `System`) has. Lets a
 *  consumer read `counts[kind]` without a null guard. */
export const EMPTY_MENU_KIND_COUNTS: Record<MenuItemKind, number> = {
  food: 0,
  drink: 0,
  dessert: 0,
  side: 0,
  appetizer: 0,
};
