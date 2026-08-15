"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { scrollToElement } from "@repo/ui/core-elements/scroll-to";
import "./menu-category-nav.css";

/** One entry of the menu's category rail. */
export interface MenuCategoryNavItem {
  /** The `id` of the section heading this entry brings into view. */
  targetId: string;
  /** The category's own name, already resolved for the rendered locale. */
  label: string;
}

interface MenuCategoryNavProps {
  /** Names the rail for a screen reader and titles the card. */
  title: string;
  items: MenuCategoryNavItem[];
  /**
   * Whether the first item section beside the rail is `catalog-section--flush-top`
   * - i.e. it is the page's first block and has dropped its own top padding.
   * The lead spacer drops the same padding, so the two columns stay level.
   */
  flushTop?: boolean;
}

/**
 * `.catalog-section`'s own top padding (`components/catalog-categories.css`),
 * which the sections column contributes above its first heading and the rail's
 * column does not. Repeated here rather than read from the class because the
 * rail is not a catalog section - it only has to start level with one. ⚠ Keep
 * the two in step.
 */
const CATALOG_SECTION_PADDING_TOP = 48;

/**
 * The menu's category rail - the list of category names beside the item grids,
 * which sticks below the fixed navbar once the page has scrolled past it.
 *
 * It exists because a tenant with a few hundred dishes turns `/categories/menu`
 * into a page you can only navigate by scrolling: the category *cards* at the
 * top are a fine index while they are on screen, and useless the moment they
 * are not. The rail is that index, kept in view.
 *
 * ⚠ **It is `position: sticky`, not a hand-positioned `fixed` box** (see
 * `menu-category-nav.css`). Sticky is what gives both halves of the requested
 * behaviour for free - in-line at the top of the first item grid, pinned under
 * the navbar from there on - and, unlike `fixed`, it stops travelling when its
 * column ends, so the rail cannot outlive the sections it addresses.
 *
 * **Rendered from `md` up only.** Its `Grid` cell carries the `hidden` prop, so
 * there is no media query here; a phone-sized index is a different control and
 * is not built yet.
 */
export function MenuCategoryNav({
  title,
  items,
  flushTop = false,
}: MenuCategoryNavProps) {
  if (items.length === 0) return null;

  return (
    <>
      {/* The rail starts level with the first item **card**, not with the
       *  section heading above it - so the two columns read as one row. The
       *  offset is the section's top padding plus its heading block, which this
       *  spacer reproduces by being that heading: the same `Box` + `Typography`
       *  markup carrying one blank line, so a change to the heading's type or
       *  rhythm moves both columns together instead of only one. */}
      <Box
        aria-hidden
        flexDirection="column"
        gap={10}
        marginBottom={32}
        paddingTop={flushTop ? 0 : CATALOG_SECTION_PADDING_TOP}
      >
        {/* A non-breaking space, not an empty element: an empty heading has
         *  no line box, and the spacer would collapse to nothing. */}
        <Typography as="p" variant="h2" className="section-title">
          {"\u00a0"}
        </Typography>
      </Box>
      <nav aria-label={title} className="menu-category-nav">
        <Card
          backgroundColor="var(--accent, #06b6d4)"
          color="var(--accent-foreground, #ffffff)"
          border="none"
          elevation={6}
          padding={12}
          gap={8}
          // A tenant with more categories than fit the viewport scrolls the rail
          // itself rather than pushing its own tail off the bottom of the screen.
          styles={{
            overflowY: "auto",
            maxHeight: "calc(100vh - var(--ui-navbar-height, 57px) - 32px)",
          }}
        >
          <Typography
            as="h2"
            variant="label"
            color="inherit"
            fontWeight={700}
            styles={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            {title}
          </Typography>
          <Box flexDirection="column" gap={2}>
            {items.map((item) => (
              <Button
                key={item.targetId}
                unstyled
                text={item.label}
                className="menu-category-nav__item"
                onClick={() => scrollToElement(`#${item.targetId}`)}
                width="100%"
                paddingX={8}
                paddingY={6}
                borderRadius={6}
                border="none"
                backgroundColor="transparent"
                color="inherit"
                styles={{
                  cursor: "pointer",
                  textAlign: "left",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  // A `button` does not inherit the page's font - left alone it
                  // renders in the UA's own face, which is neither of the
                  // tenant's. `inherit` takes the Card's, i.e. `--font-body`;
                  // the rail's title is a real `h2` and keeps `--font-display`,
                  // like every other section title on the page.
                  fontFamily: "inherit",
                }}
              />
            ))}
          </Box>
        </Card>
      </nav>
    </>
  );
}

export default MenuCategoryNav;
