"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { BREAKPOINTS, type Breakpoint } from "@repo/ui/core-elements/utils";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

// How many page numbers the bar shows at each breakpoint. Widest first, so the
// first matching min-width query wins. `xs` (min-width: 0) always matches and
// acts as the base.
const PAGE_BUTTONS: ReadonlyArray<readonly [Breakpoint, number]> = [
  ["lg", 11],
  ["md", 7],
  ["sm", 5],
  ["xs", 3],
];

const BASE_PAGE_BUTTONS = 3;

// The number of page buttons can't be driven by CSS: hiding the outer buttons of
// the widest window would show the wrong numbers near the edges (page 1 of 20
// would read 5,6,7 instead of 1,2,3), because the window clamps differently at
// each size. So the count is resolved in JS and fed to `getPageWindow`.
function usePageButtonCount(): number {
  // The server has no viewport, so it renders the `xs` count; the first client
  // render must agree for hydration. The layout effect below corrects it before
  // the browser paints.
  const [count, setCount] = useState(BASE_PAGE_BUTTONS);

  useLayoutEffect(() => {
    const queries = PAGE_BUTTONS.map(
      ([bp, buttons]) =>
        [
          window.matchMedia(`(min-width: ${BREAKPOINTS[bp]}px)`),
          buttons,
        ] as const,
    );
    const update = () => {
      const matched = queries.find(([mql]) => mql.matches);
      setCount(matched?.[1] ?? BASE_PAGE_BUTTONS);
    };
    update();
    queries.forEach(([mql]) => mql.addEventListener("change", update));
    return () =>
      queries.forEach(([mql]) => mql.removeEventListener("change", update));
  }, []);

  return count;
}

// Up to `count` page numbers, centered on the current page, clamped to
// [1, total]. Near an edge the window slides so it stays full (e.g. count 3,
// page 1 -> 1,2,3; page N -> N-2,N-1,N) rather than shrinking.
function getPageWindow(
  current: number,
  total: number,
  count: number,
): number[] {
  const size = Math.min(count, total);
  let start = current - Math.floor((size - 1) / 2);
  if (start < 1) start = 1;
  if (start + size - 1 > total) start = total - size + 1;
  return Array.from({ length: size }, (_, i) => start + i);
}

export function MoviePagination({ page, totalPages, onPageChange }: Props) {
  const t = useTranslations("CatalogPage");
  const pageButtonCount = usePageButtonCount();
  const navRef = useRef<HTMLDivElement>(null);
  // Placeholder that holds the bar's slot in normal flow. It reserves the bar's
  // height while the bar floats (fixed, out of flow), and is the element we watch
  // to decide when to dock (see the scroll effect below).
  const anchorRef = useRef<HTMLDivElement>(null);
  const [squareSize, setSquareSize] = useState<number>();
  // Measured height of the bar, used to reserve the placeholder's height so the
  // footer doesn't jump when the bar toggles between fixed and static.
  const [barHeight, setBarHeight] = useState<number>();
  // True once the user has scrolled to the end of the grid: the bar drops out of
  // its fixed position and settles into the placeholder, above the footer.
  const [docked, setDocked] = useState(true);

  // Switch pages, then ease back to the top so the new results start in view.
  // Falls back to an instant jump when the browser lacks smooth-scroll support.
  const goToPage = (next: number) => {
    onPageChange(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Keep the numeric buttons square by feeding a button's intrinsic height back
  // as its explicit width, and track the bar's height so the placeholder can
  // reserve it. Remeasured on container resize.
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const measure = () => {
      const buttons = el.querySelectorAll<HTMLButtonElement>("button");
      if (buttons.length < 3) return;
      // Square side = a numeric button's intrinsic height (independent of its
      // width), fed back as the explicit width so the buttons stay square.
      // buttons[0] is the prev arrow, so buttons[1] is the first page button.
      const slot = buttons[1]!.offsetHeight;
      setSquareSize((prev) => (prev === slot ? prev : slot));
      const height = el.offsetHeight;
      setBarHeight((prev) => (prev === height ? prev : height));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [page, totalPages, pageButtonCount]);

  // Dock the bar once the user reaches the end of the grid. While the grid still
  // extends below the fold the bar stays fixed to the viewport (floating over the
  // content); the moment its in-flow slot (the placeholder) rises to the floating
  // line - 20px above the viewport bottom, matching the fixed `bottom` offset -
  // we switch it to `position: static` so it settles in place above the footer
  // instead of overlapping it. Because the placeholder reserves the bar's exact
  // height, the swap happens at the same pixel position with no layout jump.
  useEffect(() => {
    const anchor = anchorRef.current;
    const bar = navRef.current;
    if (!anchor || !bar) return;
    const update = () => {
      const top = anchor.getBoundingClientRect().top;
      setDocked(top + bar.offsetHeight <= window.innerHeight - 20);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // Re-evaluate when the reserved height changes (bar re-measured) so the
    // threshold tracks the real bar size.
  }, [barHeight]);

  if (totalPages <= 1) return null;

  return (
    // Placeholder holding the bar's slot in normal flow. While the bar floats it
    // reserves the bar's height so the footer keeps its position; once docked the
    // static bar fills it, so its height comes from the bar itself (auto).
    <div ref={anchorRef} style={{ height: docked ? undefined : barHeight }}>
      {/* While floating, pinned to the viewport bottom (bottom: 20px, tweak
          locally) so the page controls stay reachable while scrolling a long
          grid; centered and sized to fit its content (prev, the breakpoint's
          page buttons, next); a translucent, blurred surface keeps the buttons
          legible over content scrolling behind it. Once the user reaches the end
          of the grid it docks into the placeholder above (position: static,
          centered by auto margins) so it never overlaps the footer. position/
          offset/transform/zIndex and the docked centering aren't
          UIComponentProps, so they ride in `styles`. */}
      <Box
        ref={navRef}
        role="navigation"
        aria-label={t("paginationLabel")}
        display="flex"
        alignItems="stretch"
        gap={4}
        flexWrap="nowrap"
        width="fit-content"
        padding={4}
        borderRadius={8}
        border="1px solid var(--border)"
        backgroundColor="var(--surface-2)"
        elevation={4}
        styles={
          docked
            ? {
                position: "static",
                marginLeft: "auto",
                marginRight: "auto",
              }
            : {
                position: "fixed",
                bottom: 20,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 20,
              }
        }
      >
        <IconButton
          icon="/icons/prev.svg"
          size="md"
          aria-label={t("previousPage")}
          title={t("previousPage")}
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
        />
        <Box gap={4}>
          {getPageWindow(page, totalPages, pageButtonCount).map((item) => (
            <Button
              key={item}
              size="md"
              paddingX={0}
              width={squareSize}
              aria-pressed={item === page}
              onClick={() => goToPage(item)}
              backgroundColor={item === page ? "var(--accent)" : undefined}
              color={
                item === page ? "var(--accent-foreground, #ffffff)" : undefined
              }
            >
              {item}
            </Button>
          ))}
        </Box>

        <IconButton
          icon="/icons/next.svg"
          size="md"
          aria-label={t("nextPage")}
          title={t("nextPage")}
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
        />
      </Box>
    </div>
  );
}
