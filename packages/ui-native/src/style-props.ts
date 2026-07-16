import type { ReactNode } from "react";
import type { FlexStyle, ViewStyle } from "react-native";

/**
 * Props-first layout API for `@repo/ui-native`, the native mirror of
 * `@repo/ui`'s `UIComponentProps`. Every value maps straight onto a React
 * Native `ViewStyle`, so you style `Box`/`Screen`/`Button` with props instead
 * of hand-writing `StyleSheet` objects for layout, spacing, sizing, and color.
 *
 * Differences from the web `UIComponentProps` (React Native, not CSS):
 * - `flexDirection` defaults to `'column'` in RN (CSS defaults to `row`).
 * - There is no `paddingX/paddingY`; use `paddingHorizontal/paddingVertical`.
 *   The web shorthands are accepted here and forwarded to the RN equivalents.
 * - `elevation` is a real RN style prop (Android). We also emit iOS `shadow*`
 *   props and a `boxShadow` (RN 0.76+) so a single `shadow`/`elevation` reads
 *   on both platforms.
 */
export interface UINativeProps {
  // Flex container
  flexDirection?: FlexStyle["flexDirection"];
  justifyContent?: FlexStyle["justifyContent"];
  alignItems?: FlexStyle["alignItems"];
  flexWrap?: FlexStyle["flexWrap"];
  gap?: FlexStyle["gap"];
  rowGap?: FlexStyle["rowGap"];
  columnGap?: FlexStyle["columnGap"];
  // Flex child
  flex?: FlexStyle["flex"];
  flexGrow?: FlexStyle["flexGrow"];
  flexShrink?: FlexStyle["flexShrink"];
  alignSelf?: FlexStyle["alignSelf"];
  // Sizing
  width?: FlexStyle["width"];
  height?: FlexStyle["height"];
  minWidth?: FlexStyle["minWidth"];
  maxWidth?: FlexStyle["maxWidth"];
  minHeight?: FlexStyle["minHeight"];
  maxHeight?: FlexStyle["maxHeight"];
  // Padding
  padding?: FlexStyle["padding"];
  paddingTop?: FlexStyle["paddingTop"];
  paddingBottom?: FlexStyle["paddingBottom"];
  paddingLeft?: FlexStyle["paddingLeft"];
  paddingRight?: FlexStyle["paddingRight"];
  paddingHorizontal?: FlexStyle["paddingHorizontal"];
  paddingVertical?: FlexStyle["paddingVertical"];
  /** Web-parity shorthand → `paddingHorizontal`. */
  paddingX?: FlexStyle["paddingHorizontal"];
  /** Web-parity shorthand → `paddingVertical`. */
  paddingY?: FlexStyle["paddingVertical"];
  // Margin
  margin?: FlexStyle["margin"];
  marginTop?: FlexStyle["marginTop"];
  marginBottom?: FlexStyle["marginBottom"];
  marginLeft?: FlexStyle["marginLeft"];
  marginRight?: FlexStyle["marginRight"];
  marginHorizontal?: FlexStyle["marginHorizontal"];
  marginVertical?: FlexStyle["marginVertical"];
  // Border / surface
  borderWidth?: ViewStyle["borderWidth"];
  borderColor?: ViewStyle["borderColor"];
  borderRadius?: ViewStyle["borderRadius"];
  backgroundColor?: ViewStyle["backgroundColor"];
  opacity?: ViewStyle["opacity"];
  overflow?: ViewStyle["overflow"];
  position?: FlexStyle["position"];
  // Elevation / shadow
  /** Toggle a default shadow. Use `elevation` for finer control. */
  shadow?: boolean;
  /** Shadow depth (higher = stronger). Maps to Android elevation + iOS shadow. */
  elevation?: number;
  /** Escape hatch: a raw RN style object merged last, overriding computed props. */
  styles?: ViewStyle;
  children?: ReactNode;
}

/** The subset of prop keys that map 1:1 onto a `ViewStyle` field. */
const DIRECT_KEYS = [
  "flexDirection",
  "justifyContent",
  "alignItems",
  "flexWrap",
  "gap",
  "rowGap",
  "columnGap",
  "flex",
  "flexGrow",
  "flexShrink",
  "alignSelf",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "padding",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingHorizontal",
  "paddingVertical",
  "margin",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginHorizontal",
  "marginVertical",
  "borderWidth",
  "borderColor",
  "borderRadius",
  "backgroundColor",
  "opacity",
  "overflow",
  "position",
] as const satisfies readonly (keyof UINativeProps & keyof ViewStyle)[];

/**
 * Compute cross-platform shadow style from an elevation value. Android reads
 * `elevation`; iOS reads the `shadow*` quartet; `boxShadow` (RN 0.76+) covers
 * the New Architecture renderer on both.
 */
export function getShadowStyle(elevation?: number): ViewStyle {
  if (!elevation || elevation <= 0) return {};
  const e = Math.min(24, Math.round(elevation));
  const offsetY = Math.max(1, Math.round(e * 0.5));
  const blur = Math.min(48, Math.round(e * 1.5) + 2);
  const alpha = Math.min(0.4, 0.08 + e * 0.03);
  return {
    elevation: e,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: Number(alpha.toFixed(3)),
    shadowRadius: blur / 2,
  };
}

/** Build a React Native `ViewStyle` from props-first `UINativeProps`. */
export function buildViewStyle(props: UINativeProps): ViewStyle {
  const style: Record<string, unknown> = {};

  if (props.paddingX !== undefined) style.paddingHorizontal = props.paddingX;
  if (props.paddingY !== undefined) style.paddingVertical = props.paddingY;

  for (const key of DIRECT_KEYS) {
    const value = props[key];
    if (value !== undefined) style[key] = value;
  }

  const shadow = getShadowStyle(props.elevation ?? (props.shadow ? 2 : 0));

  return { ...style, ...shadow, ...props.styles } as ViewStyle;
}
