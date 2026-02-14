import React, { CSSProperties } from 'react';
import { UIComponentProps, buildStyleProps } from './utils';
import type { Breakpoint } from './utils';
import './grid.css';

/**
 * Responsive column sizes per breakpoint (1–12).
 * Mobile-first: xs is the base; larger breakpoints override at their min-width.
 */
export type GridSize = Partial<Record<Breakpoint, number>>;

/**
 * Props for the Grid component.
 */
export interface GridProps extends UIComponentProps {
  /** When true, renders as a 12-column grid container. */
  container?: boolean;
  /** When true, renders as a grid item. Implicit if `size` is provided. */
  item?: boolean;
  /** Responsive column span per breakpoint (1–12). */
  size?: GridSize;
  /** Uniform gap between items in base-unit multiples (8px * n). Applies to container. */
  spacing?: number;
  /** Horizontal gap in base-unit multiples. Overrides `spacing` for the x-axis. */
  spacingX?: number;
  /** Vertical gap in base-unit multiples. Overrides `spacing` for the y-axis. */
  spacingY?: number;
}

const SPACING_UNIT = 8;

/**
 * Build the CSS class list for a Grid element.
 */
function buildGridClasses(
  container: boolean,
  isItem: boolean,
  size: GridSize | undefined,
  className: string | undefined,
): string {
  const classes: string[] = [];

  if (container) {
    classes.push('ui-grid-container');
  }

  if (isItem) {
    classes.push('ui-grid-item');
  }

  if (size) {
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

  return classes.join(' ');
}

/**
 * Grid — a responsive 12-column CSS Grid layout component.
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
 */
export const Grid: React.FC<GridProps> = (props) => {
  const {
    container = false,
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

  const isItem = item === true || size !== undefined;
  const gridClassName = buildGridClasses(container, isItem, size, className);

  const style: Record<string, unknown> = { ...buildStyleProps(props) };

  if (container) {
    const resolvedX = spacingX ?? spacing;
    const resolvedY = spacingY ?? spacing;
    if (resolvedX !== undefined) {
      style['--ui-grid-spacing-x'] = `${resolvedX * SPACING_UNIT}px`;
    }
    if (resolvedY !== undefined) {
      style['--ui-grid-spacing-y'] = `${resolvedY * SPACING_UNIT}px`;
    }
  }

  const finalStyle = { ...style, ...styles } as CSSProperties;

  return (
    <div id={id} className={gridClassName} style={finalStyle}>
      {children}
    </div>
  );
};

export default Grid;
