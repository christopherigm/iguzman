import { CSSProperties } from 'react';

/**
 * Props for the `UI Components` component (extracted for reuse).
 */
export interface UIComponentProps {
  display?: CSSProperties['display'];
  flexDirection?: CSSProperties['flexDirection'];
  justifyContent?: CSSProperties['justifyContent'];
  alignItems?: CSSProperties['alignItems'];
  flexWrap?: CSSProperties['flexWrap'];
  gap?: CSSProperties['gap'];
  flex?: CSSProperties['flex'];
  alignSelf?: CSSProperties['alignSelf'];
  order?: CSSProperties['order'];
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  minWidth?: CSSProperties['minWidth'];
  maxWidth?: CSSProperties['maxWidth'];
  minHeight?: CSSProperties['minHeight'];
  maxHeight?: CSSProperties['maxHeight'];
  padding?: CSSProperties['padding'];
  margin?: CSSProperties['margin'];
  marginTop?: CSSProperties['marginTop'];
  marginBottom?: CSSProperties['marginBottom'];
  marginLeft?: CSSProperties['marginLeft'];
  marginRight?: CSSProperties['marginRight'];
  marginInlineStart?: CSSProperties['marginInlineStart'];
  marginInlineEnd?: CSSProperties['marginInlineEnd'];
  border?: CSSProperties['border'];
  borderRadius?: CSSProperties['borderRadius'];
  color?: CSSProperties['color'];
  backgroundColor?: CSSProperties['backgroundColor'];
  /** Toggle a default shadow. Use `elevation` for finer control. */
  shadow?: boolean;
  /** Numeric elevation level (higher = stronger shadow) */
  elevation?: number;
  /** Inline style object that overrides other computed styles */
  styles?: CSSProperties;
  children?: any;
  className?: string;
  id?: string;
}

/**
 * Compute a more realistic box-shadow from an elevation value.
 */
export const getBoxShadow = (elevation?: number): string | undefined => {
  if (!elevation || elevation <= 0) return undefined;

  const e = Math.min(24, Math.round(elevation));

  const keyOffsetY = Math.max(1, Math.round(e * 0.5));
  const keyBlur = Math.min(64, Math.round(e * 1.25) + 2);
  const reducedKeyBlur = Math.max(1, Math.round(keyBlur * 0.6));
  const keySpread = Math.floor(e / 10);
  const keyAlpha = Math.min(0.36, 0.06 + e * 0.03);

  const ambientOffsetY = Math.max(0, Math.round(e * 0.8));
  const ambientBlur = Math.min(120, Math.round(e * 2.5) + 6);
  const reducedAmbientBlur = Math.max(1, Math.round(ambientBlur * 0.6));
  const ambientSpread = Math.floor(e / 14);
  const ambientAlpha = Math.min(0.2, 0.03 + e * 0.015);

  const key = `0 ${keyOffsetY}px ${reducedKeyBlur}px ${keySpread}px rgba(0,0,0,${keyAlpha.toFixed(3)})`;
  const ambient = `0 ${ambientOffsetY}px ${reducedAmbientBlur}px ${ambientSpread}px rgba(0,0,0,${ambientAlpha.toFixed(3)})`;

  return `${key}, ${ambient}`;
};

/**
 * Build a defensive style object from `UIComponentProps`.
 * Returns only defined CSS properties and applies computed shadow.
 */
export const createSafeStyle = (props: UIComponentProps): CSSProperties => {
  const {
    display,
    flexDirection,
    justifyContent,
    alignItems,
    flexWrap,
    gap,
    flex,
    alignSelf,
    order,
    width,
    height,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    padding,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginInlineStart,
    marginInlineEnd,
    border,
    borderRadius,
    color,
    backgroundColor,
    shadow,
    elevation,
  } = props;

  const safeStyle: CSSProperties = {};
  if (display !== undefined) safeStyle.display = display;
  if (flexDirection !== undefined) safeStyle.flexDirection = flexDirection;
  if (justifyContent !== undefined) safeStyle.justifyContent = justifyContent;
  if (alignItems !== undefined) safeStyle.alignItems = alignItems;
  if (flexWrap !== undefined) safeStyle.flexWrap = flexWrap;
  if (gap !== undefined) safeStyle.gap = gap;
  if (flex !== undefined) safeStyle.flex = flex;
  if (alignSelf !== undefined) safeStyle.alignSelf = alignSelf;
  if (order !== undefined) safeStyle.order = order;
  if (width !== undefined) safeStyle.width = width;
  if (height !== undefined) safeStyle.height = height;
  if (minWidth !== undefined) safeStyle.minWidth = minWidth;
  if (maxWidth !== undefined) safeStyle.maxWidth = maxWidth;
  if (minHeight !== undefined) safeStyle.minHeight = minHeight;
  if (maxHeight !== undefined) safeStyle.maxHeight = maxHeight;
  if (padding !== undefined) safeStyle.padding = padding;
  if (margin !== undefined) safeStyle.margin = margin;
  if (marginTop !== undefined) safeStyle.marginTop = marginTop;
  if (marginBottom !== undefined) safeStyle.marginBottom = marginBottom;
  if (marginLeft !== undefined) safeStyle.marginLeft = marginLeft;
  if (marginRight !== undefined) safeStyle.marginRight = marginRight;
  if (marginInlineStart !== undefined)
    safeStyle.marginInlineStart = marginInlineStart;
  if (marginInlineEnd !== undefined)
    safeStyle.marginInlineEnd = marginInlineEnd;
  if (border !== undefined) safeStyle.border = border;
  if (borderRadius !== undefined) safeStyle.borderRadius = borderRadius;
  if (color !== undefined) safeStyle.color = color;
  if (backgroundColor !== undefined)
    safeStyle.backgroundColor = backgroundColor;

  const effectiveElevation = elevation ?? (shadow ? 1 : 0);
  const boxShadow = getBoxShadow(effectiveElevation);
  if (boxShadow) safeStyle.boxShadow = boxShadow;

  return safeStyle;
};

export default {};
