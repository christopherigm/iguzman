"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Select } from "@repo/ui/core-elements/select";
import { Typography } from "@repo/ui/core-elements/typography";
import { Hero, type HeroLayout } from "@repo/ui/hero";

/** The layouts the site can render - the same set the API accepts. */
const HERO_LAYOUTS: HeroLayout[] = ["default", "profile"];

type Props = {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Hero logo to preview - the pending upload if there is one. */
  logo?: string;
  /** Hero background image to preview, for a tenant with no hero video. */
  backgroundImage?: string;
};

/**
 * "Hero video configuration" - how the logo and the text are composed over the
 * hero video, on the landing page and on every item detail page that has one.
 *
 * Like the watermark section, the preview renders the *real* `Hero`, fed with
 * the values currently in the form, so it cannot drift from the site. It is
 * shorter than the live one (`style`), but the logo circle still sizes itself
 * from the viewport, so it reads slightly larger here than it will on the page.
 */
export function HeroVideoSection({
  values,
  onChange,
  logo,
  backgroundImage,
}: Props) {
  const t = useTranslations("Admin");

  const layout = (
    HERO_LAYOUTS.includes(values.hero_video_layout as HeroLayout)
      ? values.hero_video_layout
      : "default"
  ) as HeroLayout;

  const videoLink = String(values.video_link ?? "");

  return (
    <Box flexDirection="column" gap={16} paddingTop={32}>
      {/* Matches the pair-group headers AdminForm renders, so this reads as a
          section of the same form rather than a panel bolted onto it. */}
      <Box
        paddingBottom={2}
        styles={{
          borderBottom:
            "1px solid color-mix(in srgb, var(--foreground) 20%, transparent)",
        }}
      >
        <Typography
          variant="label"
          fontWeight={800}
          color="var(--foreground)"
          styles={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          {t("heroVideoTitle")}
        </Typography>
      </Box>

      <Typography variant="body" margin={0}>
        {t("heroVideoIntro")}
      </Typography>

      {/* spacing is in 8px base units, not px - 3 is the 24px gutter. */}
      <Grid container spacing={3}>
        {/* ── Column 1: the control ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Box flexDirection="column" gap={12}>
            <Select
              label={t("heroVideoLayout")}
              value={layout}
              onChange={(v) => onChange("hero_video_layout", v)}
              options={HERO_LAYOUTS.map((value) => ({
                value,
                label: t(
                  value === "profile"
                    ? "heroLayoutProfile"
                    : "heroLayoutDefault",
                ),
              }))}
            />
            <Typography variant="body" margin={0}>
              {t(
                layout === "profile"
                  ? "heroLayoutProfileHint"
                  : "heroLayoutDefaultHint",
              )}
            </Typography>
          </Box>
        </Grid>

        {/* ── Column 2: the live preview ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Box flexDirection="column" gap={8}>
            <Typography
              as="span"
              variant="label"
              fontWeight={600}
              color="var(--foreground)"
            >
              {t("heroVideoPreview")}
            </Typography>

            {/* No frame around the hero: the profile circle hangs *below* it,
                outside any wrapper's padding box, so a clipping frame would cut
                the disc in half. The rounding goes on the hero itself, which
                already crops its own video. */}
            <Box>
              <Hero
                videoUrl={videoLink || null}
                backgroundImage={backgroundImage ?? null}
                logoImage={logo ?? null}
                logoAlt={String(values.site_name ?? "")}
                slogan={String(values.slogan ?? "")}
                parallax={false}
                layout={layout}
                style={{ height: 240, borderRadius: 10 }}
              />
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
