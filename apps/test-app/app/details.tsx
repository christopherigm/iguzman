import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@repo/ui-native/box';
import { Button } from '@repo/ui-native/button';
import { Screen } from '@repo/ui-native/screen';
import { Typography } from '@repo/ui-native/typography';

/** A second route to demonstrate expo-router navigation. */
export default function Details() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <Box paddingTop={insets.top} gap={20} flex={1}>
        <Typography variant="title">Details</Typography>
        <Typography variant="body" color="muted">
          This screen is rendered by app/details.tsx. Edit it and it hot-reloads.
        </Typography>
        <Box flexGrow={1} />
        <Button kind="primary" fullWidth onPress={() => router.back()}>
          Back
        </Button>
      </Box>
    </Screen>
  );
}
