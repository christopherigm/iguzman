import { forwardRef } from 'react';
import { View, type ViewProps } from 'react-native';
import { buildViewStyle, type UINativeProps } from './style-props';

export interface BoxProps extends UINativeProps {
  /** Accessible label when there is no visible text. */
  accessibilityLabel?: string;
  /** Marks the element (and children) as a single accessibility element. */
  accessible?: boolean;
  /** Accessibility role, e.g. `'header'`, `'summary'`. */
  accessibilityRole?: ViewProps['accessibilityRole'];
  /** `testID` for e2e/unit selection. */
  testID?: string;
  /** Escape hatch for pointer events (e.g. `'none'` to click through). */
  pointerEvents?: ViewProps['pointerEvents'];
}

/**
 * `Box` - the props-first `View` wrapper. Style layout, spacing, sizing, and
 * color through props (`flexDirection`, `padding`, `backgroundColor`, …); reach
 * for the `styles` escape hatch only for what the prop API doesn't cover.
 *
 * Unlike the web `Box`, flex direction defaults to React Native's `column`.
 *
 * @example
 * <Box flexDirection="row" gap={8} padding={16} backgroundColor="#fff" shadow>
 *   {children}
 * </Box>
 */
export const Box = forwardRef<View, BoxProps>(function Box(props, ref) {
  const {
    children,
    accessibilityLabel,
    accessible,
    accessibilityRole,
    testID,
    pointerEvents,
  } = props;

  return (
    <View
      ref={ref}
      style={buildViewStyle(props)}
      accessibilityLabel={accessibilityLabel}
      accessible={accessible}
      accessibilityRole={accessibilityRole}
      testID={testID}
      pointerEvents={pointerEvents}
    >
      {children}
    </View>
  );
});

export default Box;
