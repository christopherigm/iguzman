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

/** The *detail* route prefix for each kind - where one item's page lives. A
 *  drink is at `/drink/<slug>`, a dessert at `/dessert/<slug>`, so the URL says
 *  what the thing is instead of calling every item food.
 *
 *  Singular here, unlike the plural listing paths above: `/drink/michelada`
 *  reads as "the drink michelada", while `/categories/drinks` reads as "the
 *  drinks". Two shapes, two maps - build neither by concatenating the enum
 *  value, and use `menuItemHref` rather than indexing this directly. */
export const MENU_KIND_ITEM_PATHS: Record<MenuItemKind, string> = {
  food: "/food",
  drink: "/drink",
  dessert: "/dessert",
  side: "/side",
  appetizer: "/appetizer",
};

/**
 * The one detail URL of one menu item.
 *
 * `kind` is required and has no default: each route serves only its own kind
 * (see `components/menu-item-detail-page.tsx`), so guessing `food` for a caller
 * that has not got the kind to hand would build a link straight to a 404. A
 * caller that genuinely cannot know it - an order line whose item has since been
 * deleted - has no page to link to and should render no link at all.
 */
export function menuItemHref(kind: MenuItemKind, slug: string): string {
  return `${MENU_KIND_ITEM_PATHS[kind]}/${slug}`;
}

/** All-zero per-kind counts - what an unresolved host (no `System`) has. Lets a
 *  consumer read `counts[kind]` without a null guard. */
export const EMPTY_MENU_KIND_COUNTS: Record<MenuItemKind, number> = {
  food: 0,
  drink: 0,
  dessert: 0,
  side: 0,
  appetizer: 0,
};
