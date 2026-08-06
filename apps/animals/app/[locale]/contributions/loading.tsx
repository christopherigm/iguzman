import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { NavbarSpacer, PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import "./loading.css";

/**
 * What a contributor sees between pressing "My contributions" and the grid.
 *
 * Here for the same reason `contribute/loading.tsx` is - see that file for the
 * full argument. Both routes under this segment are dynamic (they read the
 * session cookie), so Next cannot prerender either, and a `Link`'s prefetch of a
 * dynamic route reaches only as far as the nearest loading boundary: without
 * one, the navbar's prefetch buys nothing and the whole server render is paid
 * after the click, with the previous page sitting there unchanged.
 *
 * It mirrors the page's own chrome - spacer, `Container size="lg"`, crumbs,
 * title, filter row, then a grid of tiles - so the real content lands where
 * these blocks were instead of shifting the page. The tile count is a guess at
 * one screenful; a contributor with three records simply sees the extras vanish,
 * which is a smaller wrong than a boundary that shows nothing.
 *
 * Sizing, spacing and colour are all props; the CSS file carries only the pulse
 * (and turns it off under `prefers-reduced-motion`).
 */

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
      className="contributions-skeleton__block"
      width={width}
      height={height}
      borderRadius={radius}
      backgroundColor={BLOCK}
    />
  );
}

export default function ContributionsLoading() {
  return (
    // `aria-hidden` rather than a live region: this is a visual placeholder, and
    // the router is what announces the navigation. See contribute/loading.tsx.
    <Box flexDirection="column" width="100%" aria-hidden>
      <NavbarSpacer />

      <Container size="lg" paddingX={10} marginTop={16}>
        <Box flexDirection="row" gap={8} alignItems="center">
          <Block width={52} height={12} radius={6} />
          <Block width={110} height={12} radius={6} />
        </Box>

        <Box flexDirection="column" gap={12} marginTop={24} marginBottom={24}>
          <Block width="min(340px, 80%)" height={34} />
          <Block width="min(520px, 100%)" height={16} />
        </Box>

        {/* The two filter rows. */}
        <Box flexDirection="column" gap={10} marginBottom={20}>
          {[0, 1].map((row) => (
            <Box key={row} flexDirection="row" gap={8} alignItems="center">
              <Block width={54} height={12} radius={6} />
              {[0, 1, 2, 3].map((chip) => (
                <Block key={chip} width={78} height={28} radius={6} />
              ))}
            </Box>
          ))}
        </Box>

        <Grid container spacing={2}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((tile) => (
            <Grid key={tile} size={{ xs: 6, sm: 4, md: 3 }}>
              <Box
                flexDirection="column"
                gap={10}
                borderRadius={10}
                border="1px solid var(--border, #e5e7eb)"
                styles={{ overflow: "hidden" }}
              >
                {/* The photograph, at the tile's own 4:3 - so the real image
                    lands in exactly this box. */}
                <Box
                  className="contributions-skeleton__block"
                  width="100%"
                  backgroundColor={BLOCK}
                  styles={{ aspectRatio: "4 / 3" }}
                />
                <Box flexDirection="column" gap={8} padding={14} paddingTop={0}>
                  <Block width={64} height={10} radius={5} />
                  <Block width="80%" height={18} />
                  <Block width="60%" height={12} radius={6} />
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}
