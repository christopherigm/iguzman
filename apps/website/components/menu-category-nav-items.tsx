"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { scrollToElement } from "@repo/ui/core-elements/scroll-to";
import "./menu-category-nav.css";

/** One entry of the menu's category rail. */
export interface MenuCategoryNavItem {
  /** The `id` of the section heading this entry brings into view. */
  targetId: string;
  /** The category's own name, already resolved for the rendered locale. */
  label: string;
}

interface MenuCategoryNavItemsProps {
  items: MenuCategoryNavItem[];
  /**
   * Called once an entry has scrolled its section into view. The floating phone
   * control closes its card on it; the rail passes nothing, since it is on
   * screen the whole time and has nothing to close.
   */
  onSelect?: () => void;
  /**
   * `"lg"` grows the hit targets for a thumb - the same one-prop difference the
   * POS till makes to the ingredient picker, and for the same reason: the two
   * lists must not become two implementations of one control. Defaults to
   * `"sm"`, the rail's.
   */
  size?: "sm" | "lg";
}

/**
 * The list of category buttons shared by both menu indexes - the sticky rail
 * (`menu-category-nav.tsx`) and the floating phone control
 * (`menu-category-nav-mobile.tsx`) - and the **only** part of the rail that
 * needs the browser, split out so the card around it (and the brandmark cradle
 * on its edge) can stay server-rendered. ⚠ That split is not cosmetic:
 * `@repo/ui/hero`, which the cradle comes from, imports `HeroVideo` at module
 * scope and the package is not marked side-effect-free, so importing it from a
 * `"use client"` module would drag `react-player` into this page's browser
 * bundle for the sake of one `<svg>`.
 */
export function MenuCategoryNavItems({
  items,
  onSelect,
  size = "sm",
}: MenuCategoryNavItemsProps) {
  const large = size === "lg";

  return (
    <Box flexDirection="column" gap={2}>
      {items.map((item) => (
        <Button
          key={item.targetId}
          unstyled
          text={item.label}
          className="menu-category-nav__item"
          onClick={() => {
            scrollToElement(`#${item.targetId}`);
            onSelect?.();
          }}
          width="100%"
          paddingX={large ? 12 : 8}
          paddingY={large ? 10 : 6}
          borderRadius={6}
          border="none"
          backgroundColor="transparent"
          color="inherit"
          styles={{
            cursor: "pointer",
            textAlign: "left",
            fontWeight: 600,
            // Sub-scale sizes with no matching Typography variant - a `Button`'s
            // label is not rendered through one.
            fontSize: large ? "1rem" : "0.875rem",
            // A `button` does not inherit the page's font - left alone it
            // renders in the UA's own face, which is neither of the tenant's.
            // `inherit` takes the Card's, i.e. `--font-body`.
            fontFamily: "inherit",
          }}
        />
      ))}
    </Box>
  );
}

export default MenuCategoryNavItems;
