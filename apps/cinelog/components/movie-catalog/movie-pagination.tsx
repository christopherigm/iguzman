"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

type PageItem = number | "ellipsis-start" | "ellipsis-end";

// `radius` is how many sibling pages to show on each side of the current page.
// It is grown at runtime to fill the available width (see fitWindowRadius).
function getPageItems(
  current: number,
  total: number,
  radius: number,
): PageItem[] {
  const items: PageItem[] = [1];

  const left = Math.max(2, current - radius);
  const right = Math.min(total - 1, current + radius);

  if (left > 2) items.push("ellipsis-start");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("ellipsis-end");
  if (total > 1) items.push(total);

  return items;
}

// Largest window radius whose rendered row still fits within `width`. The two
// prev/next arrows are always reserved so the row never overflows when an arrow
// appears or disappears as the user pages.
function fitWindowRadius(opts: {
  width: number;
  slot: number;
  gap: number;
  navW: number;
  ellipsisW: number;
  current: number;
  total: number;
}): number {
  const { width, slot, gap, navW, ellipsisW, current, total } = opts;
  if (!width || !slot) return 1;

  let best = 1;
  for (let r = 1; r <= total; r++) {
    const items = getPageItems(current, total, r);
    let rowW = navW * 2;
    let count = 2;
    for (const item of items) {
      rowW += typeof item === "number" ? slot : ellipsisW;
      count++;
    }
    rowW += gap * (count - 1);

    if (rowW > width) break;
    best = r;
    // Window already spans every page - no point widening further.
    if (current - r <= 2 && current + r >= total - 1) break;
  }
  return best;
}

export function MoviePagination({ page, totalPages, onPageChange }: Props) {
  const t = useTranslations("CatalogPage");
  const navRef = useRef<HTMLDivElement>(null);
  // Placeholder that holds the bar's slot in normal flow. It reserves the bar's
  // height while the bar floats (fixed, out of flow), and is the element we watch
  // to decide when to dock (see the scroll effect below).
  const anchorRef = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState(1);
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

  // Grow the visible page window to fill the row, remeasuring on container
  // resize. Numeric buttons are square, so any middle button gives the slot
  // width; the first/last buttons are the prev/next arrows.
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const measure = () => {
      const buttons = el.querySelectorAll<HTMLButtonElement>("button");
      if (buttons.length < 3) return;
      const width = el.clientWidth;
      const navW = Math.max(
        buttons[0]!.offsetWidth,
        buttons[buttons.length - 1]!.offsetWidth,
      );
      // Square side = a numeric button's intrinsic height (independent of its
      // width), fed back as the explicit width so the buttons stay square.
      const slot = buttons[1]!.offsetHeight;
      setSquareSize((prev) => (prev === slot ? prev : slot));
      const height = el.offsetHeight;
      setBarHeight((prev) => (prev === height ? prev : height));
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const next = fitWindowRadius({
        width,
        slot,
        gap,
        navW,
        ellipsisW: slot * 0.6,
        current: page,
        total: totalPages,
      });
      setRadius((prev) => (prev === next ? prev : next));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [page, totalPages]);

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
          grid; centered and capped to the catalog Container width (lg = 1200px);
          a translucent, blurred surface keeps the buttons legible over content
          scrolling behind it. Once the user reaches the end of the grid it docks
          into the placeholder above (position: static, centered by auto margins)
          so it never overlaps the footer. position/offset/transform/zIndex and
          the docked centering aren't UIComponentProps, so they ride in `styles`. */}
      <Box
        ref={navRef}
        role="navigation"
        aria-label={t("paginationLabel")}
        display="flex"
        justifyContent="space-between"
        alignItems="stretch"
        gap={4}
        flexWrap="wrap"
        width="100%"
        maxWidth={1200}
        padding={8}
        borderRadius={12}
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
        <Button
          size="md"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          {t("previousPage")}
        </Button>
        <Box gap={4}>
          {getPageItems(page, totalPages, radius).map((item) =>
            typeof item === "number" ? (
              <Button
                key={item}
                size="md"
                paddingX={0}
                width={squareSize}
                aria-pressed={item === page}
                onClick={() => goToPage(item)}
                backgroundColor={item === page ? "var(--accent)" : undefined}
                color={
                  item === page
                    ? "var(--accent-foreground, #ffffff)"
                    : undefined
                }
              >
                {item}
              </Button>
            ) : (
              <Typography
                key={item}
                as="span"
                variant="body"
                aria-hidden
                alignSelf="center"
                padding="0 4px"
              >
                …
              </Typography>
            ),
          )}
        </Box>

        <Button
          size="md"
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
        >
          {t("nextPage")}
        </Button>
      </Box>
    </div>
  );
}
