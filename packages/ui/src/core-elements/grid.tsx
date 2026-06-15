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
