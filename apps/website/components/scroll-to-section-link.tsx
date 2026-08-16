"use client";

import type { ReactNode } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { scrollToElement } from "@repo/ui/core-elements/scroll-to";

interface ScrollToSectionLinkProps {
  /** The `id` of the heading the click should bring into view. */
  targetId: string;
  /** The link this wraps - a whole `Card` with an `href`, in practice. */
  children: ReactNode;
}

/**
 * Turns a link whose destination is already **on this page** into a scroll.
 *
 * The menu's category cards point at `/categories/menu/<slug>`, which is the
 * right address everywhere else on the site - but on `/categories/menu` that
 * category's dishes are a few hundred pixels further down the same page, so
 * navigating away to see them is a page load that undoes itself. This catches
 * the click on its way up from the anchor and scrolls to the section heading
 * instead, exactly as the category rail beside the grids does.
 *
 * ⚠ **The link stays a real link.** It is only taken over when a target was
 * actually found and a plain left click did the finding - so a middle click or
 * a ⌘/Ctrl click still opens the category page in a new tab, and a card whose
 * section isn't rendered (an empty category has a card but no grid) navigates
 * as it always did.
 *
 * ⚠ **It has to be the capture phase.** The card is a `Link`, whose own
 * `onClick` already calls `preventDefault()` and pushes the route - so a
 * bubbling handler above it runs after the navigation has been started and
 * cancelling there does nothing. Capturing lets this stop the event before the
 * anchor's handler is reached; `preventDefault` then still has to be called
 * itself, since stopping propagation does not stop the browser from following
 * the href.
 */
export function ScrollToSectionLink({
  targetId,
  children,
}: ScrollToSectionLinkProps) {
  return (
    <Box
      // `contents`, so this wrapper adds no box of its own: the card stays the
      // grid cell's own child and keeps the sizing it has everywhere else.
      display="contents"
      onClickCapture={(event) => {
        // Anything but a plain left click is a request to open the page.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        if (!scrollToElement(`#${targetId}`)) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </Box>
  );
}

export default ScrollToSectionLink;
