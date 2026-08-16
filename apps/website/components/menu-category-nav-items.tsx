"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { scrollToElement } from "@repo/ui/core-elements/scroll-to";
import {
  MENU_NAV_ACTIVE_BACKGROUND,
  MENU_NAV_ACTIVE_FOREGROUND,
} from "./menu-category-nav-colors";
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
  /**
   * How each entry's label is ranged inside its own button. Defaults to
   * `"start"` - the rail's, where the entries are a column against the card's
   * left edge and a ragged left would read as broken. The phone card passes
   * `"center"`: it is a free-floating panel hanging off the middle of a pill,
   * and the list is what the button raised.
   */
  align?: "start" | "center";
}

/**
 * How long a press keeps the entry it lit, before the page's own scroll
 * position is allowed to disagree with it.
 *
 * A click starts a *smooth* scroll, so for the length of that travel the reader
 * is still standing in the section they are leaving - and every section between
 * the two crosses the line on the way. Without this, pressing the last category
 * runs the highlight down the whole list like a slot machine. It is a ceiling,
 * not a delay: the moment the target arrives, the lock is released and the page
 * is back in charge (see `useActiveSection`).
 */
const SETTLE_MS = 1200;

/** Subpixel slack when deciding whether a heading has reached its line. */
const LINE_TOLERANCE = 1;

/** How close to the foot of the document still counts as "at the bottom". */
const PAGE_BOTTOM_SLACK = 2;

/**
 * Which section the reader is in - the entry both indexes light up.
 *
 * **The line it measures against is each heading's own `scroll-margin-top`**,
 * read off the computed style rather than restated here. That margin is the
 * offset a jump parks the heading at (`menu-listing.tsx` sets it to clear the
 * fixed navbar), so "the heading has crossed the line" and "a click on this
 * entry has arrived" are the same event, decided by the same number - and a
 * change to the navbar's height moves both together with nothing to keep in
 * step.
 *
 * The active entry is the **last** heading at or above that line: the section a
 * reader is inside is the one whose title they most recently passed.
 *
 * ⚠ Rendered by both indexes, so both run their own copy - the rail and the
 * phone control are each mounted on this page, one of them display-none. That
 * is deliberate: the read is a handful of `getBoundingClientRect` calls on a
 * rAF-coalesced passive scroll listener, and the alternative (lifting the state
 * into a provider around a *server* component and a *client* one) is a great
 * deal of machinery for it.
 */
function useActiveSection(idsKey: string) {
  const [active, setActive] = useState<string | null>(null);
  /** The entry a press lit, and the moment the page may overrule it. */
  const pendingRef = useRef<{ id: string; until: number } | null>(null);

  useEffect(() => {
    const ids = idsKey ? idsKey.split("\n") : [];
    if (ids.length === 0) return;

    let frame = 0;

    const compute = () => {
      frame = 0;

      let current: string | null = null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element) continue;
        const line = parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
        if (element.getBoundingClientRect().top - line <= LINE_TOLERANCE) {
          current = id;
        }
      }

      // The last section is usually too short to bring its own heading all the
      // way up to the line, so at the foot of the page it is the section the
      // reader is looking at while an earlier entry is the one lit. The page
      // cannot scroll any further, so there is no ambiguity to resolve: the
      // bottom of the document *is* the last section.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - PAGE_BOTTOM_SLACK;
      if (atBottom) current = ids[ids.length - 1] ?? current;

      const pending = pendingRef.current;
      if (pending) {
        // Hold the pressed entry until its section actually arrives - or until
        // it is plainly not going to (a section too short to reach the line on
        // a page that was already near its end), at which point the page's own
        // answer is the honest one.
        if (current !== pending.id && Date.now() < pending.until) return;
        pendingRef.current = null;
      }

      setActive(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [idsKey]);

  /**
   * Light an entry the moment it is pressed, rather than when the travel it
   * starts ends - a control that answers a tap only after a 400ms scroll reads
   * as one that missed the tap.
   */
  const select = useCallback((id: string) => {
    pendingRef.current = { id, until: Date.now() + SETTLE_MS };
    setActive(id);
  }, []);

  return [active, select] as const;
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
 *
 * **One entry is lit at a time**, in the tenant's secondary colour: the section
 * the reader is currently in, whether they got there by pressing it or by
 * scrolling. Both indexes get that for free by being one component - which is
 * the same reason a jump cannot behave differently on a phone than on a
 * desktop.
 */
export function MenuCategoryNavItems({
  items,
  onSelect,
  size = "sm",
  align = "start",
}: MenuCategoryNavItemsProps) {
  const large = size === "lg";
  // A string rather than the array, so the spy re-subscribes when the sections
  // change and not on every render of a parent.
  const [activeId, select] = useActiveSection(
    items.map((item) => item.targetId).join("\n"),
  );

  return (
    <Box flexDirection="column" gap={2}>
      {items.map((item) => {
        const isActive = item.targetId === activeId;

        return (
          <Button
            key={item.targetId}
            unstyled
            text={item.label}
            className="menu-category-nav__item"
            // The list is a set of jump links into one page, so the lit entry is
            // the reader's location in it - `aria-current="location"` says
            // exactly that, where `aria-pressed` would announce a toggle nobody
            // toggled.
            aria-current={isActive ? "location" : undefined}
            onClick={() => {
              select(item.targetId);
              scrollToElement(`#${item.targetId}`);
              onSelect?.();
            }}
            width="100%"
            paddingX={large ? 12 : 8}
            paddingY={large ? 10 : 6}
            borderRadius={6}
            border="none"
            // ⚠ These win over the hover tint in `menu-category-nav.css` - an
            // inline style beats a class rule - which is the intent: a hover
            // over the lit entry must not wash the highlight out.
            backgroundColor={
              isActive ? MENU_NAV_ACTIVE_BACKGROUND : "transparent"
            }
            color={isActive ? MENU_NAV_ACTIVE_FOREGROUND : "inherit"}
            styles={{
              cursor: "pointer",
              textAlign: align === "center" ? "center" : "left",
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
        );
      })}
    </Box>
  );
}

export default MenuCategoryNavItems;
