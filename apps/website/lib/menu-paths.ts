/**
 * Where the menu lives.
 *
 * Deliberately its own module rather than part of `lib/catalog.ts`: the navbar
 * is a **client** component and needs these constants, while `catalog.ts`
 * reaches `next/headers` through `resolve-site.ts` to resolve the tenant. One
 * import of a path constant from `catalog.ts` therefore pulls server-only code
 * into the browser bundle and fails the build. Nothing here may import a server
 * module - keep it plain data.
 *
 * This replaced `lib/menu-kinds.ts`, which carried a `MenuItemKind` enum, a
 * listing path per kind and a detail path per kind. The menu is sectioned by
 * the tenant's own `MenuCategory` rows now, and by nothing else.
 */

/** Path of the page listing the tenant's whole menu, every category together. */
export const MENU_ALL_PATH = "/categories/menu";

/** The listing page for one menu category - the section a customer clicks into
 *  from the menu page or the navbar's Menu dropdown. */
export function menuCategoryHref(categorySlug: string): string {
  return `${MENU_ALL_PATH}/${categorySlug}`;
}

/**
 * The one detail URL of one menu item.
 *
 * `categorySlug` is required and has no default: the category is the first
 * segment of the path, so a caller that has not got it to hand would build a
 * link straight to a 404. A caller that genuinely cannot know it - an order line
 * whose item has since been deleted - has no page to link to and should render
 * no link at all.
 *
 * ⚠ **This URL moves when an operator re-files the dish.** The slug alone is
 * globally unique, so the category segment addresses nothing extra; it is there
 * because the site asked for it to read that way. Old paths are redirected in
 * `next.config.js`, but a link shared before a re-filing will 404.
 */
export function menuItemHref(categorySlug: string, slug: string): string {
  return `/menu/${categorySlug}/${slug}`;
}
