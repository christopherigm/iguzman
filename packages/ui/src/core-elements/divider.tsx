import React, { CSSProperties } from 'react';
import { Box } from './box';

export interface DividerProps {
  /**
   * Thickness of the divider line in px.
   * For horizontal dividers this is the element height; for vertical dividers it is the element width.
   * Defaults to `1`.
   */
  thickness?: number;
  /** Background color of the divider line. Defaults to `'var(--surface-2, #e5e7eb)'`. */
  color?: string;
  /**
   * Explicit length of the divider element.
   * For horizontal dividers this is the width (defaults to `'100%'`).
   * For vertical dividers this is the height.
   */
  height?: number | string;
  /** Extra CSS class names. */
  className?: string;
  /** Margin on all sides. */
  margin?: CSSProperties['margin'];
  /** Margin top. */
  marginTop?: CSSProperties['marginTop'];
  /** Margin bottom. */
  marginBottom?: CSSProperties['marginBottom'];
  /** Margin left. */
  marginLeft?: CSSProperties['marginLeft'];
  /** Margin right. */
  marginRight?: CSSProperties['marginRight'];
  /** Margin on the horizontal axis (left and right). */
  marginX?: CSSProperties['margin'];
  /** Margin on the vertical axis (top and bottom). */
  marginY?: CSSProperties['margin'];
  /** Opacity of the divider. */
  opacity?: CSSProperties['opacity'];
}

/**
 * Divider — a thin line used to visually separate content sections.
 *
 * Renders as a `Box` (`<div>`) with no semantic `<hr>` quirks.
 * All visual properties are applied via inline styles.
 *
 * @example
 * // Horizontal, 1 px, default color
 * <Divider />
 *
 * @example
 * // Horizontal, 2 px, custom color
 * <Divider thickness={2} color="var(--border, #d1d5db)" />
 *
 * @example
 * // Vertical, 1 px wide, 20 px tall
 * <Divider height={20} thickness={1} color="rgba(0,0,0,0.1)" />
 */
export const Divider: React.FC<DividerProps> = ({
  thickness = 1,
  color = 'var(--surface-2, #e5e7eb)',
  height,
  className,
  margin,
  marginTop,
  marginBottom,
  marginLeft,
  marginRight,
  marginX,
  marginY,
  opacity,
}) => {
  const isVertical = height !== undefined;

  const style: CSSProperties = isVertical
    ? {
        width: thickness,
        height,
        backgroundColor: color,
        flexShrink: 0,
        opacity,
        margin,
        marginTop: marginTop ?? marginY,
        marginBottom: marginBottom ?? marginY,
        marginLeft: marginLeft ?? marginX,
        marginRight: marginRight ?? marginX,
      }
    : {
        width: '100%',
        height: thickness,
        backgroundColor: color,
        flexShrink: 0,
        opacity,
        margin,
        marginTop: marginTop ?? marginY,
        marginBottom: marginBottom ?? marginY,
        marginLeft: marginLeft ?? marginX,
        marginRight: marginRight ?? marginX,
      };

  return (
    <Box
      className={className}
      styles={style}
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
    />
  );
};

export default Divider;
