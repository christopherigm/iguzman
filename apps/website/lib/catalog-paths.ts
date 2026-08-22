/**
 * Where the catalog lives - every URL the three buyable families are reachable
 * at, in one place.
 *
 * All three share one shape:
 *
 * ```
 * /<family>                       the listing: categories + every item
 * /<family>/<category>            one category
 * /<family>/<category>/<item>     one item
 * ```
 *
 * so `/menu/espresso/latte` and `/products/tools/hammer` are the same address
 * read twice. This replaced `lib/menu-paths.ts`, which described that shape for
 * the menu alone while products and services sat on a flat `/<family>/<slug>`
 * with their categories exiled to a parallel `/categories/<family>/<slug>`
 * tree. The `/categories` prefix is gone; `next.config.js` redirects it.
 *
 * ⚠ **The category segment is real, not decoration.** An item's category slug
 * has to be to hand to link to it at all, which is why every helper here takes
 * one and none of them defaults it - a caller that guesses would build a link
 * straight to a 404. It is also why `Product.category` / `Service.category` /
 * `MenuItem.category` are all required in the API: an item with no category has
 * no address. The flip side is that **re-filing an item in the CMS moves it**;
 * the one-segment route below is what keeps the old link alive.
 *
 * Deliberately its own module with no server import, for the reason
 * `menu-paths.ts` was: the navbar is a **client** component and needs these
 * constants, while `lib/catalog.ts` reaches `next/headers` through
 * `resolve-site.ts` to resolve the tenant. One import of a path constant from
 * `catalog.ts` therefore pulls server-only code into the browser bundle and
 * fails the build. Nothing here may import a server module - keep it plain data.
 */

/**
 * The three families, named as the rest of the app names them: `BuyableItem.kind`,
 * `CategoryDetail`'s `kind` prop and `ItemQuestionCard`'s all use `"food"` for
 * the menu, so this does too rather than adding a fourth spelling.
 */
export type CatalogFamily = "product" | "service" | "food";

/** The first segment of every URL in one family - and the family's own listing
 *  page, which is that segment on its own. */
export const CATALOG_ROOT: Record<CatalogFamily, string> = {
  product: "/products",
  service: "/services",
  food: "/menu",
};

/**
 * The listing page for one category - the section a customer clicks into from
 * the family's listing page or the navbar.
 *
 * ⚠ Also the address the family's *items* answer at when the slug is theirs
 * rather than a category's: the one-segment route looks a miss up as an item
 * and permanently redirects to its canonical three-segment URL. That is what
 * keeps every `/products/<slug>` link printed before the categories existed
 * working, and it is why an item slug may never collide with a category slug in
 * the same family - the category wins.
 */
export function categoryHref(
  family: CatalogFamily,
  categorySlug: string,
): string {
  return `${CATALOG_ROOT[family]}/${categorySlug}`;
}

/**
 * The one detail URL of one catalog item.
 *
 * `categorySlug` is required and has no default: the category is the first
 * segment of the path, so a caller that has not got it to hand would build a
 * link straight to a 404. A caller that genuinely cannot know it - an order line
 * whose item has since been deleted - has no page to link to and should render
 * no link at all.
 *
 * ⚠ **This URL moves when an operator re-files the item.** The slug alone is
 * unique within its family, so the category segment addresses nothing extra; it
 * is there because the site asked for it to read that way. The one-segment
 * route redirects a bare slug on to wherever the item now lives, so a link
 * shared before a re-filing still arrives.
 */
export function itemHref(
  family: CatalogFamily,
  categorySlug: string,
  slug: string,
): string {
  return `${CATALOG_ROOT[family]}/${categorySlug}/${slug}`;
}

// ---------------------------------------------------------------------------
// Menu aliases
// ---------------------------------------------------------------------------
// The menu is the family with the most call sites by far - a food tenant's
// navbar, landing, phone index and every `sites/<slug>/` landing point at it -
// and `menuItemHref(cat, slug)` reads better at those than
// `itemHref("food", cat, slug)`. They are one-liners over the generic helpers,
// not a second implementation.

/** Path of the page listing the tenant's whole menu, every category together. */
export const MENU_ALL_PATH = CATALOG_ROOT.food;

/** The listing page for one menu category. */
export function menuCategoryHref(categorySlug: string): string {
  return categoryHref("food", categorySlug);
}

/** The one detail URL of one menu item. */
export function menuItemHref(categorySlug: string, slug: string): string {
  return itemHref("food", categorySlug, slug);
}

/**
 * The glyph every "go to the menu" control wears - the landing heroes' menu
 * CTA, the "see more" and "browse" buttons, and the phone menu index's own
 * button. It lives here, beside the path those controls point at, because it
 * is worn by client and server components alike and a path string copied into
 * nine files is a path string that goes stale in eight of them.
 */
export const MENU_ICON = "/icons/food.svg";
