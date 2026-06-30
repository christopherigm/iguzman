import { useLayoutEffect, useRef, useState } from "react";
import { TvButton } from "@repo/ui-tv/tv-button";
import { useT } from "@/i18n/provider";
import "./tv-pagination.css";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

type PageItem = number | "ellipsis-start" | "ellipsis-end";

// Ported from apps/cinelog's MoviePagination: first page, a window around the
// current page, the last page, with ellipses bridging the gaps. `radius` is the
// number of sibling pages shown on each side; it grows to fill the row width.
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

// Largest window radius whose rendered row still fits within `width`. Both
// prev/next buttons are always reserved so the row never overflows when one
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

/** D-pad-navigable numbered pagination rendered below the catalog grid. */
export function TvPagination({ page, totalPages, onPageChange }: Props) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState(1);

  // Grow the visible page window to fill the row, remeasuring on resize. Page
  // buttons are square; prev/next keep their text width.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const pageEl = el.querySelector<HTMLElement>(".tv-pagination__page");
      if (!pageEl) return;
      // Square side = the button's intrinsic height (padding + font), which is
      // independent of width, so feed it back as the explicit width.
      const slot = pageEl.offsetHeight;
      el.style.setProperty("--tv-page-size", `${slot}px`);
      const width = el.clientWidth;
      const navEls = el.querySelectorAll<HTMLElement>(".tv-pagination__nav");
      const navW = Array.from(navEls).reduce(
        (max, n) => Math.max(max, n.offsetWidth),
        slot,
      );
      const ellipsisEl = el.querySelector<HTMLElement>(
        ".tv-pagination__ellipsis",
      );
      const ellipsisW = ellipsisEl?.offsetWidth ?? slot * 0.6;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const next = fitWindowRadius({
        width,
        slot,
        gap,
        navW,
        ellipsisW,
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

  if (totalPages <= 1) return null;

  return (
    <div className="tv-pagination" ref={containerRef}>
      <TvButton
        className="tv-pagination__nav"
        disabled={page <= 1}
        onPress={() => onPageChange(page - 1)}
      >
        {t("previousPage")}
      </TvButton>

      {getPageItems(page, totalPages, radius).map((item) =>
        typeof item === "number" ? (
          <TvButton
            key={item}
            className={
              item === page
                ? "tv-pagination__page tv-pagination__page--active"
                : "tv-pagination__page"
            }
            onPress={() => onPageChange(item)}
          >
            {item}
          </TvButton>
        ) : (
          <span key={item} className="tv-pagination__ellipsis">
            …
          </span>
        ),
      )}

      <TvButton
        className="tv-pagination__nav"
        disabled={page >= totalPages}
        onPress={() => onPageChange(page + 1)}
      >
        {t("nextPage")}
      </TvButton>
    </div>
  );
}
