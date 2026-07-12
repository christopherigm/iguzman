import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@repo/ui-native/theme-provider';

/**
 * Root layout. Wraps every route in the safe-area + theme providers. The
 * palette was chosen at scaffold time; swap it for any @repo/ui-native palette
 * (cyan/ocean/violet/emerald/amber/rose) or pass `scheme` to force light/dark.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider palette="cyan">
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
