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

/**
 * The entry the reader is currently in - pressed, or scrolled to - painted in
 * the tenant's **secondary** colour, which `[locale]/layout.tsx` publishes as
 * `--secondary` beside the accent (and `--secondary-foreground` with it, since
 * CSS cannot pick black or white against a colour by itself).
 *
 * ⚠ **The fallbacks are load-bearing.** The layout leaves both variables unset
 * for a tenant that has never chosen a secondary colour, precisely so this
 * decides instead: the card is already the accent, so an accent-coloured
 * highlight on it would be invisible. A tint of the card's own text is the one
 * fill guaranteed to read on it, whether the accent is light or dark.
 */
export const MENU_NAV_ACTIVE_BACKGROUND =
  "var(--secondary, color-mix(in srgb, currentColor 26%, transparent))";
export const MENU_NAV_ACTIVE_FOREGROUND =
  "var(--secondary-foreground, inherit)";
