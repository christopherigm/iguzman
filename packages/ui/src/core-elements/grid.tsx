import React, { CSSProperties } from "react";
import { UIComponentProps, buildStyleProps } from "./utils";
import type { Breakpoint } from "./utils";
import "./grid.css";

/**
 * Responsive column sizes per breakpoint (1-12).
 * Mobile-first: xs is the base; larger breakpoints override at their min-width.
 */
export type GridSize = Partial<Record<Breakpoint, number>>;

/**
 * Per-breakpoint visibility toggle. Each entry hides the item **within that
 * breakpoint's own band only** (range-scoped, not cascading like `size`): e.g.
 * `{ xs: true }` hides it below `sm` and shows it from `sm` up, while
 * `{ md: true }` hides it only between `md` and `lg`. Compose bands to hide
 * across a wider range (`{ md: true, lg: true, xl: true }` = "hidden from md up").
 */
export type GridHidden = Partial<Record<Breakpoint, boolean>>;

/** A grid item's flow position within a breakpoint band. */
export type GridOrder = "first" | "last";

/**
 * Per-breakpoint flow order. Each entry pushes the item to the **start**
 * (`"first"`) or **end** (`"last"`) of the flex container **within that
 * breakpoint's own band only** (range-scoped, like `hidden`, not cascading like
 * `size`): `{ xs: "last" }` sends it last below `sm` and restores its authored
 * position from `sm` up. Compose bands to span a wider range. No effect in
 * masonry mode (multi-column layout ignores `order`).
 */
export type GridReorder = Partial<Record<Breakpoint, GridOrder>>;

/**
 * Responsive masonry column count per breakpoint.
 * Mobile-first: xs is the base; larger breakpoints override at their min-width.
 */
export type MasonryColumns = Partial<Record<Breakpoint, number>>;

/** Default masonry column counts when `masonry` is passed as a boolean. */
const DEFAULT_MASONRY_COLUMNS: MasonryColumns = { xs: 1, sm: 2 };

/**
 * Props for the Grid component.
 */
export interface GridProps extends UIComponentProps {
  /** When true, renders as a 12-column grid container. */
  container?: boolean;
  /**
   * Lays out children as a masonry (CSS multi-column) instead of a flex grid.
   * Children flow top-to-bottom into balanced columns, eliminating the vertical
   * gaps a flex grid leaves when items have unequal heights.
   * Pass `true` for the default `{ xs: 1, sm: 2 }`, or a responsive column-count
   * map (e.g. `{ xs: 1, sm: 2, lg: 3 }`). Implies `container`; item `size` props
   * are ignored in masonry mode (each child spans one column).
   */
  masonry?: boolean | MasonryColumns;
  /** When true, renders as a grid item. Implicit if `size` is provided. */
  item?: boolean;
  /** Responsive column span per breakpoint (1-12). */
  size?: GridSize;
  /**
   * Per-breakpoint visibility. Each `true` entry sets `display: none` within
   * that breakpoint's band only (see {@link GridHidden}). The breakpoint
   * thresholds live once in `grid.css`, so no consumer writes a media query.
   */
  hidden?: GridHidden;
  /**
   * Per-breakpoint flow order (`"first"` | `"last"`), range-scoped per band -
   * see {@link GridReorder}. Only affects a flex grid item; ignored in masonry.
   */
  reorder?: GridReorder;
  /** Uniform gap between items in base-unit multiples (8px * n). Applies to container. */
  spacing?: number;
  /** Horizontal gap in base-unit multiples. Overrides `spacing` for the x-axis. */
  spacingX?: number;
  /** Vertical gap in base-unit multiples. Overrides `spacing` for the y-axis. */
  spacingY?: number;
  [key: `data-${string}`]: string | undefined;
}

const SPACING_UNIT = 8;

/**
 * Resolve the `masonry` prop into a responsive column-count map, or `undefined`
 * when masonry layout is disabled.
 */
function resolveMasonry(
  masonry: boolean | MasonryColumns | undefined,
): MasonryColumns | undefined {
  if (!masonry) return undefined;
  if (masonry === true) return DEFAULT_MASONRY_COLUMNS;
  return masonry;
}

/**
 * Build the CSS class list for a Grid element.
 */
function buildGridClasses(
  container: boolean,
  isItem: boolean,
  size: GridSize | undefined,
  hidden: GridHidden | undefined,
  reorder: GridReorder | undefined,
  masonryColumns: MasonryColumns | undefined,
  className: string | undefined,
): string {
  const classes: string[] = [];

  if (masonryColumns) {
    classes.push("ui-grid-masonry");
    const breakpoints = Object.keys(masonryColumns) as Breakpoint[];
    for (const bp of breakpoints) {
      const cols = masonryColumns[bp];
      if (cols !== undefined && cols >= 1) {
        classes.push(`ui-grid-masonry-${bp}-${Math.round(cols)}`);
      }
    }
  } else if (container) {
    classes.push("ui-grid-container");
  }

  if (isItem) {
    classes.push("ui-grid-item");
  }

  // Span classes only apply to a flex grid; masonry children span one column.
  if (size && !masonryColumns) {
    const breakpoints = Object.keys(size) as Breakpoint[];
    for (const bp of breakpoints) {
      const cols = size[bp];
      if (cols !== undefined && cols >= 1 && cols <= 12) {
        classes.push(`ui-grid-${bp}-${Math.round(cols)}`);
      }
    }
  }

  // Per-breakpoint visibility - each band's media query lives in grid.css.
  if (hidden) {
    const breakpoints = Object.keys(hidden) as Breakpoint[];
    for (const bp of breakpoints) {
      if (hidden[bp]) {
        classes.push(`ui-grid-hidden-${bp}`);
      }
    }
  }

  // Per-breakpoint flow order - each band's media query lives in grid.css.
  // No-op in masonry, where multi-column layout ignores `order`.
  if (reorder && !masonryColumns) {
    const breakpoints = Object.keys(reorder) as Breakpoint[];
    for (const bp of breakpoints) {
      const value = reorder[bp];
      if (value === "first" || value === "last") {
        classes.push(`ui-grid-order-${value}-${bp}`);
      }
    }
  }

  if (className) {
    classes.push(className);
  }

  return classes.join(" ");
}

/**
 * Grid - a responsive 12-column CSS Grid layout component.
 *
 * Can act as a **container** (sets up the 12-column grid with optional gap)
 * or as an **item** (spans a number of columns, responsive per breakpoint).
 * A single Grid element can be both container and item simultaneously for nesting.
 *
 * @example
 * <Grid container spacing={2}>
 *   <Grid size={{ xs: 12, sm: 6, md: 4 }}>Column 1</Grid>
 *   <Grid size={{ xs: 12, sm: 6, md: 4 }}>Column 2</Grid>
 *   <Grid size={{ xs: 12, sm: 6, md: 4 }}>Column 3</Grid>
 * </Grid>
 *
 * @example
 * // Masonry: children flow into balanced columns with no vertical gaps.
 * <Grid masonry={{ xs: 1, sm: 2 }} spacing={3}>
 *   <Grid item>Short card</Grid>
 *   <Grid item>Tall card</Grid>
 *   <Grid item>Another card</Grid>
 * </Grid>
 */
export const Grid: React.FC<GridProps> = (props) => {
  const {
    container = false,
    masonry,
    item,
    size,
    hidden,
    reorder,
    spacing,
    spacingX,
    spacingY,
    children,
    className,
    id,
    styles,
  } = props;

  const masonryColumns = resolveMasonry(masonry);
  const isContainer = container || masonryColumns !== undefined;
  const isItem = item === true || size !== undefined;
  const gridClassName = buildGridClasses(
    container,
    isItem,
    size,
    hidden,
    reorder,
    masonryColumns,
    className,
  );

  const style: Record<string, unknown> = { ...buildStyleProps(props) };

  if (isContainer) {
    const resolvedX = spacingX ?? spacing;
    const resolvedY = spacingY ?? spacing;
    if (resolvedX !== undefined) {
      style["--ui-grid-spacing-x"] = `${resolvedX * SPACING_UNIT}px`;
    }
    if (resolvedY !== undefined) {
      style["--ui-grid-spacing-y"] = `${resolvedY * SPACING_UNIT}px`;
    }
  }

  const finalStyle = { ...style, ...styles } as CSSProperties;

  const dataProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => key.startsWith("data-")),
  );

  return (
    <div id={id} className={gridClassName} style={finalStyle} {...dataProps}>
      {children}
    </div>
  );
};

export default Grid;
