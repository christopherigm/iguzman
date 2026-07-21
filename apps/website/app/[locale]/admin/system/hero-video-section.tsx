"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Select } from "@repo/ui/core-elements/select";
import { Slider, type SliderStep } from "@repo/ui/core-elements/slider";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { Hero, type HeroLayout, type HeroLogoBackground } from "@repo/ui/hero";

/** The layouts the site can render - the same set the API accepts. */
const HERO_LAYOUTS: HeroLayout[] = ["default", "profile"];

/** The logo-background shapes the site can render - the same set the API accepts. */
const HERO_LOGO_BACKGROUNDS: HeroLogoBackground[] = [
  "none",
  "circle",
  "square",
  "rounded",
  "triangle",
  "pentagon",
  "hexagon",
  "octagon",
  "logo",
];

/** Admin-namespace message key for each shape's option label. */
const LOGO_BACKGROUND_LABEL_KEY: Record<HeroLogoBackground, string> = {
  none: "heroLogoBgNone",
  circle: "heroLogoBgCircle",
  square: "heroLogoBgSquare",
  rounded: "heroLogoBgRounded",
  triangle: "heroLogoBgTriangle",
  pentagon: "heroLogoBgPentagon",
  hexagon: "heroLogoBgHexagon",
  octagon: "heroLogoBgOctagon",
  logo: "heroLogoBgLogo",
};

/**
 * Whole-percent stops shared by both size sliders (the badge size and the logo
 * size within it). 100 is the current full size; below that the target shrinks.
 * The range matches the bounds the API validates, so the CMS cannot compose a
 * value the backend then rejects.
 */
const SCALE_STEPS: SliderStep[] = [50, 60, 70, 80, 90, 100].map((v) => ({
  value: v,
  label: `${v}%`,
}));

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
 * shorter than the live one (`style`), and its overlaid content (logo, slogan,
 * profile circle) is scaled down (`contentScale`) so the constrained box reads
 * as a look-and-feel preview rather than at the real, viewport-derived sizes.
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

  const logoBackground = (
    HERO_LOGO_BACKGROUNDS.includes(
      values.hero_logo_background as HeroLogoBackground,
    )
      ? values.hero_logo_background
      : "none"
  ) as HeroLogoBackground;

  const videoLink = String(values.video_link ?? "");
  const logoScale = Number(values.hero_logo_scale ?? 100);
  const logoBackgroundScale = Number(values.hero_logo_background_scale ?? 100);

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
            {/* Slogan lives here rather than in the main field list: it is part
                of the hero composition, and the preview beside it shows it live. */}
            <TextInput
              label={t("slogan")}
              value={String(values.slogan ?? "")}
              onChange={(v) => onChange("slogan", v)}
              rows={2}
              multirow
            />

            {/* Layout and the badge shape behind the logo sit side by side -
                the badge shape is available in either layout. */}
            <Box gap={12}>
              <Box flex={1}>
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
              </Box>
              <Box flex={1}>
                <Select
                  label={t("heroLogoBackground")}
                  value={logoBackground}
                  onChange={(v) => onChange("hero_logo_background", v)}
                  options={HERO_LOGO_BACKGROUNDS.map((value) => ({
                    value,
                    label: t(LOGO_BACKGROUND_LABEL_KEY[value]),
                  }))}
                />
              </Box>
            </Box>

            {/* The size controls only act on the badge, so they show only when a
                shape is chosen; with no badge there is nothing to size. Badge
                size (the whole shape) sits above logo size (the fill within it). */}
            {logoBackground !== "none" && (
              <>
                <Slider
                  label={t("heroLogoBgSize")}
                  steps={SCALE_STEPS}
                  value={logoBackgroundScale}
                  onChange={(v) =>
                    onChange("hero_logo_background_scale", Number(v))
                  }
                />
                <Slider
                  label={t("heroLogoSize")}
                  steps={SCALE_STEPS}
                  value={logoScale}
                  onChange={(v) => onChange("hero_logo_scale", Number(v))}
                />
              </>
            )}
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
                logoBackground={logoBackground}
                profileLogoScale={logoScale / 100}
                profileBackgroundScale={logoBackgroundScale / 100}
                contentScale={0.5}
                style={{ height: 240, borderRadius: 10 }}
              />
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
