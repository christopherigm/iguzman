import type { ReactNode } from 'react';
import {
  ScrollView,
  StatusBar,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme } from './theme-provider';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a `ScrollView`. @default false */
  scroll?: boolean;
  /** Inner padding around content (dp). @default theme.spacing.lg */
  padding?: number;
  /** Center children on the cross axis. @default false */
  center?: boolean;
  /** Override the themed `background` color. */
  backgroundColor?: string;
  testID?: string;
}

/**
 * `Screen` - the themed root wrapper for a route. Paints the theme background,
 * syncs the status-bar style to the color scheme, and optionally scrolls or
 * centers its content. Pair with `react-native-safe-area-context` at the app
 * level for notch insets.
 *
 * @example
 * <Screen scroll>
 *   <Typography variant="title">Home</Typography>
 * </Screen>
 */
export function Screen({
  children,
  scroll = false,
  padding,
  center = false,
  backgroundColor,
  testID,
}: ScreenProps) {
  const { colors, scheme, spacing } = useTheme();
  const pad = padding ?? spacing.lg;
  const bg = backgroundColor ?? colors.background;

  const content: ViewStyle = {
    padding: pad,
    ...(center ? { alignItems: 'center', justifyContent: 'center' } : {}),
    ...(scroll ? { flexGrow: 1 } : { flex: 1 }),
  };

  const barStyle = scheme === 'dark' ? 'light-content' : 'dark-content';

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={content}
      >
        <StatusBar barStyle={barStyle} backgroundColor={bg} />
        {children}
      </ScrollView>
    );
  }

  return (
    <View testID={testID} style={[{ backgroundColor: bg }, content]}>
      <StatusBar barStyle={barStyle} backgroundColor={bg} />
      {children}
    </View>
  );
}

export default Screen;
