"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Icon } from "@repo/ui/core-elements/icon";
import { Typography } from "@repo/ui/core-elements/typography";
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
  /** The button's visible text - the page's own "Menu" heading. */
  label: string;
  items: MenuCategoryNavItem[];
  /**
   * The tenant's brandmark (`System.img_brandmark`), drawn as the button's icon.
   * Unlike the rail's cradled mark this is **not** gated on the "Framed heading"
   * setting: the cradle is a piece of the frame's design language, while this is
   * simply the site's icon on its own button, and a tenant that has one should
   * wear it there. `null` falls back to a generic menu glyph.
   */
  brandmark?: string | null;
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
   * Unlike the button's `brandmark` this **is** gated on the tenant's "Framed
   * heading" setting, exactly as the rail's is: a cradle is a piece of that
   * frame's design language, where a button icon is just the site's own mark.
   */
  cradle?: ReactNode;
}

/** The fallback icon for a tenant with no brandmark of its own. */
const FALLBACK_ICON = "/icons/hamburger.svg";

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
 */
export function MenuCategoryNavMobile({
  title,
  label,
  items,
  brandmark = null,
  cradle = null,
}: MenuCategoryNavMobileProps) {
  const [open, setOpen] = useState(false);
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

  if (items.length === 0) return null;

  return (
    <nav ref={rootRef} aria-label={title} className="menu-category-nav-mobile">
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
        {brandmark ? (
          <Image
            src={brandmark}
            // Decorative: the visible label beside it already names the button,
            // and a screen reader announcing the site's name here would only
            // read "<tenant> Menu".
            alt=""
            width={24}
            height={24}
            style={{ borderRadius: "50%", objectFit: "contain" }}
          />
        ) : (
          <Icon icon={FALLBACK_ICON} size={18} color={MENU_NAV_FOREGROUND} />
        )}
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
