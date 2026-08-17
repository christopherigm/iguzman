import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";

interface RecommendationsShellProps {
  /** "Don't forget to add these" - the nudge above the strip. */
  heading: string;
  /** One `<Grid size=...>` cell per card. */
  children: React.ReactNode;
}

/**
 * The heading and grid the checkout recommendation strip is laid out in.
 *
 * Split out because the strip has two renderers - a server one that draws
 * `BuyableCard` (so a signed-in customer's hearts resolve on the server, as they
 * do in every other grid) and a client one that draws `BuyableCardView` for a
 * guest, whose items only exist after `localStorage` has been resolved in the
 * browser. That is the same split `favorites/page.tsx` and
 * `favorites/guest-favorites.tsx` already carry; without this shell the two
 * would hold their own copy of this markup and drift.
 *
 * It takes the heading as a **prop** rather than reading `useTranslations` /
 * `getTranslations` itself, because those two are not the same hook - and this
 * one module has to compile into both a server and a client component.
 *
 * Deliberately renders nothing of its own when there is nothing to show: the
 * caller decides, since an empty strip must not leave a dangling heading over a
 * gap at the foot of the cart.
 */
export function RecommendationsShell({
  heading,
  children,
}: RecommendationsShellProps) {
  return (
    <Box
      flexDirection="column"
      gap={12}
      marginTop={24}
      paddingTop={20}
      // A rule rather than a card: the strip belongs to the lines above it, and
      // a second surface under the list reads as a separate section of the page.
      styles={{ borderTop: "1px solid var(--border)" }}
    >
      <Typography as="h2" variant="h4" margin={0} color="var(--foreground)">
        {heading}
      </Typography>
      <Grid container spacing={2}>
        {children}
      </Grid>
    </Box>
  );
}
