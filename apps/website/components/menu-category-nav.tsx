import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { BrandmarkCradle, HERO_BADGE_PLATE } from "@repo/ui/hero";
import { MenuCategoryNavItems } from "./menu-category-nav-items";
import type { MenuCategoryNavItem } from "./menu-category-nav-items";
import {
  MENU_NAV_BACKGROUND,
  MENU_NAV_FOREGROUND,
} from "./menu-category-nav-colors";
import "./menu-category-nav.css";

export type { MenuCategoryNavItem };

interface MenuCategoryNavProps {
  /** Names the rail for a screen reader. It is not printed - see below. */
  title: string;
  items: MenuCategoryNavItem[];
  /**
   * Whether the first item section beside the rail is `catalog-section--flush-top`
   * - i.e. it is the page's first block and has dropped its own top padding.
   * The lead spacer drops the same padding, so the two columns stay level.
   */
  flushTop?: boolean;
  /**
   * The tenant's brandmark, cradled on the rail's top edge - passed only when
   * the tenant's "Framed heading" setting (`hero_text_frame`) is on, exactly as
   * the footer's cradle is gated. `null` keeps the plain card.
   */
  brandmark?: string | null;
  brandmarkAlt?: string;
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
 * `.catalog-section`'s own **bottom** padding, the other half of that pair.
 *
 * The rail's grid cell is as tall as the whole sections column, which ends 56px
 * below the last item card - so a sticky rail that travelled its cell to the
 * end came to rest with its bottom edge that far past the grid it addresses.
 * Given back as the rail's own bottom margin (a sticky box is constrained to
 * its containing block *minus its margins*), the last resting position lines
 * the rail's bottom edge up with the last card instead. ⚠ Keep in step with
 * `catalog-categories.css`.
 */
const CATALOG_SECTION_PADDING_BOTTOM = 56;

/**
 * The cradle's arch, as multiples of the badge - `BrandmarkCradle`'s `height`
 * and `width`, whose defaults are 0.7 and 2.1.
 *
 * The arch is raised here because the pinned rail's card sits a whole section
 * heading below the navbar (see the spacer in the markup), so an arch the height
 * of the hero's would leave the mark that far down the screen, reading as a
 * brandmark adrift in the page rather than one holding the top of the rail.
 *
 * The width grows with it, and has to: a shoulder that climbs 1.3 badges over
 * the default's short run comes out as a steep peak rather than the swell the
 * shorter arch reads as.
 *
 * ⚠ The height cannot go much further. The arch's crest stands `height * badge`
 * above the card, and two things bound that: pinned, it must stay clear of the
 * fixed navbar, and in flow it must stay inside the spacer above it. The tighter
 * of the two is ~1.5 badges at the widest viewport, where the badge is at its
 * 50px ceiling and the heading block is at its own.
 */
const CRADLE_ARCH_HEIGHT = 1;
const CRADLE_ARCH_WIDTH = 2.8;

/**
 * The clearance between the mark and the arch that closes over it, as a multiple
 * of the badge - so the mark is set *into* the arch like a medallion in a niche
 * rather than perched on its crest.
 *
 * This is the arrangement a tall arch wants and a short one cannot have. With
 * the hero's 0.7-badge arch there is no room above the mark to close over it,
 * which is why the shared default leaves the cradle open; with 1.3 there is arch
 * to spare, and a mark perched on that much of it reads as small and stranded.
 *
 * ⚠ Raising it does **not** move the mark up - it sinks it. The ring's top is
 * the arch's crest, so a wider ring means a lower mark inside the same arch.
 */
const CRADLE_ENCLOSE = 0.05;

/**
 * The tenant's brandmark cradled on the top edge of a menu index - the rail's
 * card below, and the phone control's card (`menu-category-nav-mobile.tsx`),
 * which takes it as a **node** rather than importing it.
 *
 * ⚠ That is the reason this is a component rather than four props spread twice:
 * `@repo/ui/hero` imports `HeroVideo` at module scope and the package is not
 * marked side-effect-free, so a `"use client"` module importing `BrandmarkCradle`
 * drags `react-player` into this page's browser bundle for one `<svg>` - the same
 * split `menu-category-nav-items.tsx` exists for. The phone control is a client
 * component, so `menu-listing.tsx` (a server one) renders this and hands it down.
 *
 * Both indexes wear the identical arch: they are one feature at two widths, and
 * a second set of numbers here could only drift from the first.
 */
export function MenuNavCradle({
  brandmark,
  brandmarkAlt = "",
}: {
  brandmark: string;
  brandmarkAlt?: string;
}) {
  return (
    <BrandmarkCradle
      image={brandmark}
      imageAlt={brandmarkAlt}
      // The arches rise out of the card itself, so both they and the area
      // they enclose take the card's own background and the swell reads as
      // one shape. The disc does **not** follow the theme with them: like
      // every other plate a brand mark is drawn on it is a flat white
      // (`HERO_BADGE_PLATE`), since the mark inside it was drawn for one
      // ground and a dark plate takes its dark ink with it.
      color={MENU_NAV_BACKGROUND}
      fill={MENU_NAV_BACKGROUND}
      circleBackground={HERO_BADGE_PLATE}
      // ⚠ No straight flanks. They are the parent's top border, and this
      // parent is a `Card` with rounded top corners: a square rule drawn
      // on the corner's chord leaves a stub of accent hanging past each
      // curve. Without them the arch rises straight out of the card's own
      // surface and the corners stay round.
      flanks={false}
      height={CRADLE_ARCH_HEIGHT}
      width={CRADLE_ARCH_WIDTH}
      // The arch closes over the mark rather than cradling it - see the
      // constant. The disc is a white plate either way, so on this one the
      // ring of accent around it is what reads as the niche.
      enclose={CRADLE_ENCLOSE}
    />
  );
}

/**
 * The menu's category rail - the list of category names beside the item grids,
 * which sticks below the fixed navbar once the page has scrolled past it.
 *
 * It exists because a tenant with a few hundred dishes turns `/menu`
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
 * **It has no printed title.** `title` names it for a screen reader and nothing
 * else: a heading over a column of category names says what the column already
 * says, and it was the one thing between the cradled brandmark and the list.
 *
 * **Rendered from `md` up only.** Its `Grid` cell carries the `hidden` prop, so
 * there is no media query here. Below that the index is
 * `MenuCategoryNavMobile` - a floating button raising the same list, because a
 * phone has no column beside the grids to give a rail. ⚠ The two boundaries
 * (this cell's `hidden={{ xs: true, sm: true }}` and that file's one media
 * query) are the same breakpoint on purpose - keep them in step.
 */
export function MenuCategoryNav({
  title,
  items,
  flushTop = false,
  brandmark = null,
  brandmarkAlt = "",
}: MenuCategoryNavProps) {
  if (items.length === 0) return null;

  return (
    <>
      {/* `.catalog-section`'s top padding, which the sections column contributes
       *  above its first heading and this column does not. It is deliberately
       *  *outside* the sticky box: a click on the rail parks the target heading
       *  at the navbar and leaves that padding above the viewport, so a pinned
       *  rail must not carry it. */}
      {!flushTop && <Box aria-hidden height={CATALOG_SECTION_PADDING_TOP} />}
      <nav
        aria-label={title}
        className="menu-category-nav"
        style={{ marginBottom: CATALOG_SECTION_PADDING_BOTTOM }}
      >
        {/* ⚠ **This spacer is what keeps the two columns level, in both of the
         *  rail's states, and it is inside the sticky box for the pinned one.**
         *
         *  The rail starts level with the first item **card**, not with the
         *  section heading above it - so the two columns read as one row. The
         *  offset is that heading block, which this spacer reproduces by *being*
         *  it: the same `Box` + `Typography` markup carrying one blank line, so
         *  a change to the heading's type or rhythm moves both columns together
         *  instead of only one.
         *
         *  Pinned, the sticky box's own top edge comes to rest at the navbar +
         *  16px - which is exactly the `scroll-margin-top` the section headings
         *  carry, i.e. where the heading of the section just scrolled to is
         *  sitting. So the spacer puts the card's top edge on that section's
         *  first item card, whichever section the reader jumped to. A hand-
         *  computed `top` offset could only restate this heading's height in
         *  pixels and then go stale the moment it changed.
         *
         *  It is also the room the cradled brandmark hangs up into. */}
        <Box
          aria-hidden
          flex="0 0 auto"
          flexDirection="column"
          gap={10}
          marginBottom={32}
        >
          {/* A non-breaking space, not an empty element: an empty heading has
           *  no line box, and the spacer would collapse to nothing. */}
          <Typography as="p" variant="h2" className="section-title">
            {"\u00a0"}
          </Typography>
        </Box>
        {/* The card and the mark cradled on its top edge. This box is what the
         *  cradle is positioned against - not the `nav`, whose top edge is the
         *  spacer's - and it is the one that shrinks when the list is longer
         *  than the viewport, hence `minHeight: 0` on both it and the card. */}
        <Box
          flexDirection="column"
          styles={{ position: "relative", minHeight: 0 }}
        >
          {/* The tenant's brandmark cradled on the rail's top edge, drawn by the
           *  same component the hero's framed heading and the footer's edge use -
           *  so the three brand moments are one object rather than three that can
           *  drift. It hangs off this box rather than off the `Card` because the
           *  card scrolls its own overflow (a tenant with more categories than
           *  fit the viewport), and `overflow: auto` would clip the disc away. */}
          {brandmark && (
            <MenuNavCradle brandmark={brandmark} brandmarkAlt={brandmarkAlt} />
          )}
          <Card
            backgroundColor={MENU_NAV_BACKGROUND}
            color={MENU_NAV_FOREGROUND}
            border="none"
            elevation={6}
            padding={12}
            gap={8}
            // A tenant with more categories than fit the viewport scrolls the
            // rail itself rather than pushing its own tail off the bottom of the
            // screen. The height budget is the `nav`'s (see the CSS); this only
            // has to be shrinkable inside it.
            styles={{ overflowY: "auto", minHeight: 0 }}
          >
            <MenuCategoryNavItems items={items} />
          </Card>
        </Box>
      </nav>
    </>
  );
}

export default MenuCategoryNav;
