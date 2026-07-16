import {
  Text,
  type TextProps as RNTextProps,
  type TextStyle,
} from "react-native";
import { useTheme } from "./theme-provider";
import { typeScale, type TypeVariant } from "./theme";

export interface TypographyProps {
  /** Type scale variant. Sets font size, line height, and default weight. */
  variant?: TypeVariant;
  children: RNTextProps["children"];
  /** Text color. Defaults to the theme `foreground`; `'muted'` uses the muted token. */
  color?: string | "foreground" | "muted" | "accent";
  textAlign?: TextStyle["textAlign"];
  fontWeight?: TextStyle["fontWeight"];
  /** Truncate to N lines with an ellipsis. */
  numberOfLines?: number;
  accessibilityRole?: RNTextProps["accessibilityRole"];
  testID?: string;
  /** Escape hatch: raw `TextStyle` merged last. */
  styles?: TextStyle;
  onPress?: RNTextProps["onPress"];
}

function resolveColor(
  color: TypographyProps["color"],
  colors: ReturnType<typeof useTheme>["colors"],
): string {
  switch (color) {
    case undefined:
    case "foreground":
      return colors.foreground;
    case "muted":
      return colors.muted;
    case "accent":
      return colors.accent;
    default:
      return color;
  }
}

/**
 * `Typography` - themed `Text`. Picks size/weight from the shared type scale and
 * color from the active theme, so text reads consistently across screens.
 *
 * @example
 * <Typography variant="title">Welcome</Typography>
 * <Typography variant="caption" color="muted">Subtitle</Typography>
 */
export function Typography({
  variant = "body",
  children,
  color,
  textAlign,
  fontWeight,
  numberOfLines,
  accessibilityRole,
  testID,
  styles,
  onPress,
}: TypographyProps) {
  const { colors } = useTheme();
  const scale = typeScale[variant];

  const style: TextStyle = {
    fontSize: scale.fontSize,
    lineHeight: scale.lineHeight,
    fontWeight: fontWeight ?? scale.fontWeight,
    color: resolveColor(color, colors),
    ...(textAlign ? { textAlign } : {}),
    ...styles,
  };

  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      accessibilityRole={accessibilityRole}
      testID={testID}
      onPress={onPress}
    >
      {children}
    </Text>
  );
}

export default Typography;
