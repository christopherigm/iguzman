import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer, PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import "./loading.css";

/**
 * What a contributor sees between pressing a FAB and the form arriving.
 *
 * ⚠ **This file is the difference between a slow page and a page that looks
 * broken**, and it is why it sits on the segment rather than on one route. All
 * three contribute pages are dynamic - they read `searchParams` and the session
 * cookie - so Next cannot prerender any of them, and a `Link`'s prefetch of a
 * dynamic route only reaches as far as the nearest loading boundary. With no
 * boundary here at all, a prefetch of `/contribute/sightings` came back as 245
 * bytes of route tree and nothing else: pressing the FAB then paid for the whole
 * server render *after* the click, with the old page still on screen and no
 * indication that anything had happened. This shell is what the prefetch can now
 * cache and paint instantly, so the wait reads as a page loading rather than as
 * a dead button.
 *
 * It deliberately mirrors the three pages' own chrome - spacer, `Container
 * size="md"`, a crumb row, a title, then the first card - so the real content
 * lands in the same places these blocks occupied instead of shifting the page.
 *
 * Sizing, spacing and colour are all props; the CSS file carries only the pulse
 * (and turns it off under `prefers-reduced-motion`), which is the one thing
 * UIComponentProps has no answer for.
 */

/** Shared fill for every block - a wash of the page's own surface token. */
const BLOCK = "var(--surface-2, #e5e7eb)";

function Block({
  width,
  height,
  radius = 8,
}: {
  width: number | string;
  height: number;
  radius?: number;
}) {
  return (
    <Box
      className="contribute-skeleton__block"
      width={width}
      height={height}
      borderRadius={radius}
      backgroundColor={BLOCK}
    />
  );
}

export default function ContributeLoading() {
  return (
    // `aria-hidden` rather than a live region: the boundary is a visual
    // placeholder, and next-intl's strings are not available to a loading file
    // without making it a client component. A screen reader is told about the
    // navigation by the router, not by this.
    <Box flexDirection="column" width="100%" aria-hidden>
      <NavbarSpacer />

      <Container size="md" paddingX={10} marginTop={16}>
        {/* The breadcrumb row. */}
        <Box flexDirection="row" gap={8} alignItems="center">
          <Block width={52} height={12} radius={6} />
          <Block width={64} height={12} radius={6} />
          <Block width={96} height={12} radius={6} />
        </Box>

        {/* The title and its one-line intro. */}
        <Box flexDirection="column" gap={12} marginTop={24} marginBottom={24}>
          <Block width="min(340px, 80%)" height={34} />
          <Block width="min(520px, 100%)" height={16} />
        </Box>

        {/* The first stage's card: its header, then a stack of fields. */}
        <Box
          flexDirection="column"
          gap={20}
          padding={20}
          borderRadius={12}
          border="1px solid var(--border, #e5e7eb)"
        >
          <Box flexDirection="column" gap={10}>
            <Block width={110} height={14} radius={6} />
            <Block width="min(280px, 70%)" height={20} />
          </Box>

          <Block width="100%" height={6} radius={3} />

          {[0, 1, 2].map((row) => (
            <Box key={row} flexDirection="column" gap={8}>
              <Block width={96} height={12} radius={6} />
              <Block width="100%" height={44} />
            </Box>
          ))}

          <Box flexDirection="row" justifyContent="flex-end">
            <Block width={120} height={40} />
          </Box>
        </Box>
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}
