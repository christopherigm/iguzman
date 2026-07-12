import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from './theme-provider';
import type { ThemeColors } from './theme';

/** Semantic color intent (mirrors `@repo/ui`'s `ButtonKind`). */
export type ButtonKind = 'primary' | 'success' | 'error' | 'warning';
/** Visual treatment of the intent color. */
export type ButtonVariant = 'solid' | 'outline' | 'ghost';

export interface ButtonProps {
  children: string;
  onPress?: PressableProps['onPress'];
  /** Semantic color intent. @default 'primary' */
  kind?: ButtonKind;
  /** Fill treatment. @default 'solid' */
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Show a spinner and block presses. */
  loading?: boolean;
  /** Stretch to the full width of the parent. */
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  styles?: ViewStyle;
}

function intentColors(kind: ButtonKind, colors: ThemeColors): {
  fill: string;
  onFill: string;
} {
  switch (kind) {
    case 'success':
      return { fill: colors.success, onFill: colors.successForeground };
    case 'error':
      return { fill: colors.error, onFill: colors.errorForeground };
    case 'warning':
      return { fill: colors.warning, onFill: colors.warningForeground };
    case 'primary':
    default:
      return { fill: colors.accent, onFill: colors.accentForeground };
  }
}

/**
 * `Button` - themed, pressable button. `kind` sets the intent color; `variant`
 * chooses solid/outline/ghost. Press feedback dims via `pressed` opacity.
 *
 * @example
 * <Button kind="primary" onPress={save}>Save</Button>
 * <Button kind="error" variant="outline" onPress={remove}>Delete</Button>
 */
export function Button({
  children,
  onPress,
  kind = 'primary',
  variant = 'solid',
  disabled = false,
  loading = false,
  fullWidth = false,
  testID,
  accessibilityLabel,
  styles,
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const { fill, onFill } = intentColors(kind, colors);
  const isDisabled = disabled || loading;

  const solid = variant === 'solid';
  const outline = variant === 'outline';

  const textColor = solid ? onFill : fill;
  const spinnerColor = solid ? onFill : fill;

  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: solid ? fill : 'transparent',
    borderWidth: outline ? 1 : 0,
    borderColor: outline ? fill : 'transparent',
    opacity: isDisabled ? 0.5 : 1,
    ...(fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }),
  };

  const label: TextStyle = {
    color: textColor,
    fontSize: 16,
    fontWeight: '600',
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [base, pressed && { opacity: 0.7 }, styles]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <Text style={label}>{children}</Text>
      )}
    </Pressable>
  );
}

export default Button;
