"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Icon } from "@repo/ui/core-elements/icon";
import { Typography } from "@repo/ui/core-elements/typography";
import { MENU_ICON } from "@/lib/catalog-paths";
import { MenuCategoryNavItems } from "./menu-category-nav-items";
import type { MenuCategoryNavItem } from "./menu-category-nav-items";
import {
  MENU_NAV_BACKGROUND,
  MENU_NAV_FOREGROUND,
} from "./menu-category-nav-colors";
import "./menu-category-nav-mobile.css";

interface MenuCategoryNavMobileProps {
  /** Names the control for a screen reader - the rail's `title`, unprinted. */
  title: string;
  /** The button's visible text - "See Menu", not the page's own heading: the
   *  pill is an invitation to open the list, and a button labelled with the
   *  name of the page it is already on says nothing. */
  label: string;
  items: MenuCategoryNavItem[];
  /**
   * The cradled brandmark hung on the card's top edge - the rail's own
   * `MenuNavCradle`, rendered by `menu-listing.tsx` and passed down as a
   * **node**.
   *
   * ⚠ It is a prop rather than an import because this is a client component and
   * `@repo/ui/hero` (where the cradle lives) pulls `HeroVideo` - and so
   * `react-player` - into the browser bundle at module scope. Rendered by the
   * server component above and handed over, none of that crosses the boundary.
   *
   * It **is** gated on the tenant's "Framed heading" setting, exactly as the
   * rail's is: a cradle is a piece of that frame's design language, where the
   * button's own glyph (`MENU_ICON`) simply says what the button does.
   */
  cradle?: ReactNode;
}

/**
 * The chevron on the button. ⚠ It is a chevron-*down* drawn rotated: closed, it
 * points **up** (where the card will come from), and it turns over to point down
 * when the card is up (where it will go). See `menu-category-nav-mobile.css` -
 * the rotation is not a decorative flourish, it is which way the arrow faces.
 */
const CHEVRON_ICON = "/icons/chevron-down.svg";

/**
 * The menu's category index on a phone: a pill floating just above the bottom
 * edge of the viewport which raises a card of the same category entries the
 * sticky rail lists - and which **parks itself under the last item grid** once
 * the reader reaches the end of the menu.
 *
 * It is the `xs`/`sm` half of one feature. `MenuCategoryNav` - the rail beside
 * the item grids - is `md` and up, and the two are mutually exclusive: the rail
 * lives in a `Grid` cell carrying `hidden={{ xs: true, sm: true }}`, and this
 * one is taken out of the page from `md` up by the single media query in
 * `menu-category-nav-mobile.css`. ⚠ Those two boundaries are the same
 * breakpoint on purpose - moving one without the other leaves the page with
 * either two indexes or none.
 *
 * **A rail could not simply be shrunk into this.** Beside the grids there is a
 * column to give the index; on a phone there is not, and a full-width bar of
 * category names would cost more of the screen than the dishes it is there to
 * reach. So the list is only on screen while it is being used, and what is
 * permanent is one button.
 *
 * **The entries are the rail's own `MenuCategoryNavItems`**, at `size="lg"` for
 * a thumb - so a click here scrolls exactly as a click on the rail does
 * (`scrollToElement` at the section heading's `id`, which carries the
 * `scroll-margin-top` that clears the navbar), and the two indexes cannot drift
 * into two behaviours. The card closes itself on the way, since it is over the
 * very content the reader just asked to see.
 *
 * ⚠ **The card is never unmounted** - it is folded down into the button with
 * `visibility`/`opacity`/`transform`, so both directions animate. A card that
 * mounted on open could only animate on the way in, and would pop out.
 *
 * ⚠ **The control is `position: sticky`, and the card is lifted out of its
 * flow** (see the CSS). Sticky is what gives the parking behaviour for free -
 * the pill floats while its own flow position is below the fold and returns to
 * it when the page scrolls that far - and it only works because the box in flow
 * is the button alone. In flow the card is ~360px tall, and a parked control
 * reserving that much would open a hole between the last dish and the footer.
 *
 * ⚠ **While it floats, a halo is painted behind it** - a radial gradient of the
 * page's own background, drawn as a dome whose lower half falls off the bottom
 * edge of the screen (`--floating` in the CSS). Over a grid of dish photographs
 * a pill of one flat colour has nothing to sit against and reads as part of
 * whichever card is behind it; the halo is the page clearing a space for it.
 * It is painted **only** in the floating state, which is why this component
 * measures one - parked, the pill is already on the page's own background, and
 * a glow around it there would read as a smudge.
 */
export function MenuCategoryNavMobile({
  title,
  label,
  items,
  cradle = null,
}: MenuCategoryNavMobileProps) {
  const [open, setOpen] = useState(false);
  // Whether the pill is *floating* over the page rather than parked at the end
  // of the menu - which is the only state the halo below it is painted in. See
  // the effect that measures it.
  const [floating, setFloating] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const triggerId = `${baseId}-trigger`;

  // Dismissal, while the card is up: a press anywhere else on the page, or
  // Escape. Both are what a reader who has changed their mind reaches for, and
  // neither costs a scrim over the page - which would be a heavier promise than
  // this control makes (it is a jump list, not a dialog).
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape has to leave the focus somewhere, and the button that opened the
      // card is the only thing left of it. Reached by `id` rather than a ref
      // because `@repo/ui`'s `Button` is a plain function component and forwards
      // none - the alternative is dropping to a bare `<button>` for this alone.
      document.getElementById(triggerId)?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, triggerId]);

  // Floating, or parked? A `position: sticky` box has no state a stylesheet can
  // select on, and the two situations want different things: floating, the pill
  // is over the item cards and needs the halo behind it to be legible at all;
  // parked, it is a control sitting under the last row of dishes on the page's
  // own background, where a glow around it would only read as a smudge.
  //
  // ⚠ The measurement is the definition of sticky, not an approximation of it:
  // the box is drawn at `min(its flow position, the offset line)`, so it is
  // stuck exactly while its rendered bottom edge *is* that line, and parked as
  // soon as its own flow position has risen above it.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    // ⚠ Read, never restate: the offset is a `calc()` over `--ui-fab-offset`
    // and `env(safe-area-inset-bottom)` (see the CSS), so the number only
    // exists once the browser has resolved it - and it moves with the app's own
    // token and with the device's home indicator.
    let offset = 0;
    const readOffset = () => {
      offset = parseFloat(getComputedStyle(element).bottom) || 0;
    };

    // One measurement per frame at most: `scroll` fires far more often than the
    // page paints, and this reads layout.
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight - offset;
      // The 1px slack is for a fractional viewport height (a zoomed page, a
      // device with a non-integer DPR), where the two numbers agree to within
      // less than a pixel and an exact comparison flickers.
      setFloating(element.getBoundingClientRect().bottom >= line - 1);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };
    const onResize = () => {
      readOffset();
      onScroll();
    };

    readOffset();
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    // ⚠ The boundary also moves without anyone scrolling: every dish photograph
    // that finishes loading pushes this control further down the page, and a
    // menu that fit on one screen a moment ago no longer does. Without this the
    // first paint's answer would stand until the reader's first scroll.
    const observer = new ResizeObserver(onScroll);
    observer.observe(document.documentElement);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <nav
      ref={rootRef}
      aria-label={title}
      className={`menu-category-nav-mobile${
        floating ? " menu-category-nav-mobile--floating" : ""
      }`}
    >
      {/* The card, plus whatever hangs off its top edge. A plain `div` rather
       *  than a `Box`: everything it carries is the lift out of the flow and the
       *  open/close transition, which are the CSS file's business, and the width
       *  goes with them because the card's own centring translate is part of the
       *  same transform. ⚠ The cradle hangs off *this* box and not off the
       *  `Card`, exactly as on the rail - the card scrolls its own overflow for a
       *  tenant with more categories than fit, and `overflow: auto` would clip
       *  the disc away. */}
      <div
        id={panelId}
        className={`menu-category-nav-mobile__panel${
          open ? " menu-category-nav-mobile__panel--open" : ""
        }`}
      >
        {cradle}
        <Card
          backgroundColor={MENU_NAV_BACKGROUND}
          color={MENU_NAV_FOREGROUND}
          border="none"
          // A step above the button's own shadow: the card is the thing that has
          // just come off the page, and it is read over the item cards.
          elevation={12}
          padding={10}
          gap={8}
          // The measure is the panel's (see the CSS) - wide enough for a category
          // name, never wider than the screen it floats over. A tenant with more
          // categories than fit scrolls the card rather than pushing its own tail
          // off the top of the viewport.
          width="100%"
          maxHeight="min(52vh, 360px)"
          styles={{ overflowY: "auto" }}
        >
          <MenuCategoryNavItems
            items={items}
            size="lg"
            // Centred, unlike the rail's: this card is a free-floating panel
            // hanging off the middle of a pill, and a column of names ranged
            // left inside it reads as offset from the button that raised it.
            align="center"
            onSelect={() => setOpen(false)}
          />
        </Card>
      </div>
      <Button
        id={triggerId}
        unstyled
        className="menu-category-nav-mobile__trigger"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-controls={panelId}
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        gap={10}
        paddingX={16}
        paddingY={10}
        // A pill: the radius is half of anything the content can grow to, so the
        // ends stay round whatever the label's length or the tenant's font.
        borderRadius={999}
        border="none"
        backgroundColor={MENU_NAV_BACKGROUND}
        color={MENU_NAV_FOREGROUND}
        elevation={8}
        styles={{ cursor: "pointer" }}
      >
        {/* The same glyph every "go to the menu" button on the site wears
         *  (`MENU_ICON`), rather than the tenant's own `img_brandmark` as it
         *  used to: this control is one of those buttons, and a site's mark
         *  says which site you are on, not what the button does. */}
        <Icon icon={MENU_ICON} size={18} color={MENU_NAV_FOREGROUND} />
        <Typography
          as="span"
          variant="h6"
          fontWeight={700}
          color={MENU_NAV_FOREGROUND}
          styles={{ whiteSpace: "nowrap" }}
        >
          {label}
        </Typography>
        <Icon
          icon={CHEVRON_ICON}
          size={14}
          color={MENU_NAV_FOREGROUND}
          className={`menu-category-nav-mobile__chevron${
            open ? " menu-category-nav-mobile__chevron--open" : ""
          }`}
        />
      </Button>
    </nav>
  );
}

export default MenuCategoryNavMobile;
