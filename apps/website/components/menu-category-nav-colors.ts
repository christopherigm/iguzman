/**
 * The surface every menu category index is painted in - the tenant's accent and
 * the foreground that reads on it.
 *
 * Two controls draw that surface: the sticky rail beside the item grids
 * (`menu-category-nav.tsx`, from `md` up) and the floating button and card that
 * replace it on a phone (`menu-category-nav-mobile.tsx`). One pair of constants
 * so the two cannot end up different colours - and, on the rail, so the swell
 * the brandmark's cradle rises out of cannot end up a different colour from the
 * card it rises out of.
 *
 * ⚠ Plain data, imported by both and importing nothing itself - deliberately.
 * The mobile control is a `"use client"` module and the rail is a *server*
 * component (it renders `BrandmarkCradle`, and `@repo/ui/hero` drags
 * `react-player` into any client bundle that touches it), so neither of them may
 * import the other.
 */
export const MENU_NAV_BACKGROUND = "var(--accent, #06b6d4)";
export const MENU_NAV_FOREGROUND = "var(--accent-foreground, #ffffff)";
