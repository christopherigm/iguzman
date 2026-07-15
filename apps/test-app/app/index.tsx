import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@repo/ui-native/box';
import { Button } from '@repo/ui-native/button';
import { Screen } from '@repo/ui-native/screen';
import { Typography } from '@repo/ui-native/typography';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'not set';

/** Home route - a props-first showcase of @repo/ui-native. */
export default function Home() {
  const insets = useSafeAreaInsets();

  return (
    <Screen scroll>
      <Box paddingTop={insets.top} gap={24}>
        <Box gap={8}>
          <Typography variant="hero">Test App</Typography>
          <Typography variant="body" color="muted">
            Expo SDK 56 · React Native · @repo/ui-native
          </Typography>
        </Box>

        <Box
          gap={12}
          padding={16}
          borderRadius={8}
          backgroundColor="#00000010"
        >
          <Typography variant="label" color="accent">
            API
          </Typography>
          <Typography variant="caption" color="muted">
            {API_URL}
          </Typography>
        </Box>

        <Box gap={12}>
          <Link href="/details" asChild>
            <Button kind="primary">Go to details</Button>
          </Link>
          <Button kind="success" variant="outline">
            Outline action
          </Button>
        </Box>
      </Box>
    </Screen>
  );
}
