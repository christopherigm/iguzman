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

const CSS_PROP_KEYS: (keyof UIComponentProps & keyof CSSProperties)[] = [
  'display', 'flexDirection', 'justifyContent', 'alignItems', 'flexWrap',
  'gap', 'flex', 'alignSelf', 'order', 'width', 'height', 'minWidth',
  'maxWidth', 'minHeight', 'maxHeight', 'padding', 'margin', 'marginTop',
  'marginBottom', 'marginLeft', 'marginRight', 'marginInlineStart',
  'marginInlineEnd', 'border', 'borderRadius', 'color', 'backgroundColor',
];

/**
 * Extract CSS style properties from UIComponentProps.
 * Picks only defined CSS props and computes boxShadow from shadow/elevation.
 */
export function buildStyleProps(props: UIComponentProps): CSSProperties {
  const style: Record<string, unknown> = {};
  for (const key of CSS_PROP_KEYS) {
    if (props[key] !== undefined) style[key] = props[key];
  }
  const boxShadow = getBoxShadow(props.elevation ?? (props.shadow ? 1 : 0));
  if (boxShadow) style.boxShadow = boxShadow;
  return style as CSSProperties;
}

/**
 * Breakpoint keys for the responsive grid system.
 */
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Breakpoint minimum-width values in pixels (mobile-first).
 */
export const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
};

export default {};
