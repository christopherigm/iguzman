"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Select } from "@repo/ui/core-elements/select";
import { Slider, type SliderStep } from "@repo/ui/core-elements/slider";
import {
  LOGO_BACKGROUND_SHAPES,
  LOGO_BACKGROUND_LABEL_KEY,
  SCALE_STEPS,
} from "@/components/admin/logo-background-options";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  Hero,
  HeroTextFrame,
  type HeroLayout,
  type HeroLogoBackground,
  type HeroOverlayStyle,
} from "@repo/ui/hero";
import {
  SHAPE_DIVIDER_MASKS,
  type ShapeDividerMask,
} from "@repo/ui/shape-divider";
import { HERO_DIVIDER_ELEVATION } from "@/components/hero";

/** The layouts the site can render - the same set the API accepts. */
const HERO_LAYOUTS: HeroLayout[] = ["default", "none", "profile"];

/** Admin-namespace message key for each layout's option label. */
const LAYOUT_LABEL_KEY: Record<HeroLayout, string> = {
  default: "heroLayoutDefault",
  none: "heroLayoutNone",
  profile: "heroLayoutProfile",
};

/** The dark-overlay styles the site can render - the same set the API accepts. */
const HERO_OVERLAY_STYLES: HeroOverlayStyle[] = [
  "none",
  "full",
  "bottom",
  "top",
  "both",
  "vignette",
];

/** Admin-namespace message key for each overlay style's option label. */
const OVERLAY_STYLE_LABEL_KEY: Record<HeroOverlayStyle, string> = {
  none: "heroOverlayNone",
  full: "heroOverlayFull",
  bottom: "heroOverlayBottom",
  top: "heroOverlayTop",
  both: "heroOverlayBoth",
  vignette: "heroOverlayVignette",
};

/** A divider shape the hero can offer: the self-contained SVG shapes only. */
type HeroDivider = Exclude<ShapeDividerMask, "brandmark">;

/**
 * The bottom-divider options: "none" (a hard edge, the default) plus each named
 * shape the site can cut. Only the bottom edge is exposed here - the component
 * supports "top" too, but the hero only ever dissolves into the page below it.
 * `brandmark` is excluded: it needs a same-origin brandmark URL the landing hero
 * doesn't plumb, so it isn't offered as a hero divider here.
 */
const HERO_DIVIDERS: (HeroDivider | "none")[] = [
  "none",
  ...SHAPE_DIVIDER_MASKS.filter((m): m is HeroDivider => m !== "brandmark"),
];

/** Admin-namespace message key for each divider option's label. */
const DIVIDER_LABEL_KEY: Record<HeroDivider | "none", string> = {
  none: "heroDividerNone",
  wave: "heroDividerWave",
  scallop: "heroDividerScallop",
  zigzag: "heroDividerZigzag",
  spikes: "heroDividerSpikes",
  arches: "heroDividerArches",
  slant: "heroDividerSlant",
};

/**
 * Overlay strength, in the whole percents the API stores. Coarser than the size
 * sliders because the eye reads darkness in broad steps; 0 is "no overlay",
 * which the style select can also express - either way nothing is drawn.
 */
const OVERLAY_OPACITY_STEPS: SliderStep[] = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
].map((v) => ({ value: v, label: `${v}%` }));

/**
 * Overlay extent - how far the gradient reaches across the frame, on the same
 * whole-percent scale the API stores. 50 is the neutral reach that reproduces
 * the site's historical gradients; the slider lets the tenant pull the dark band
 * in towards the edge or push it further across.
 */
const OVERLAY_EXTENT_STEPS: SliderStep[] = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
].map((v) => ({ value: v, label: `${v}%` }));

type Props = {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Hero logo to preview - the pending upload if there is one. */
  logo?: string;
  /** Hero background image to preview, for a tenant with no hero video. */
  backgroundImage?: string;
  /**
   * Brandmark to preview inside the text-frame circle - the pending upload if
   * there is one, else undefined when none is uploaded (then the frame previews
   * as a bare outline, exactly as the site renders it).
   */
  brandmark?: string;
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
  brandmark,
}: Props) {
  const t = useTranslations("Admin");

  const layout = (
    HERO_LAYOUTS.includes(values.hero_video_layout as HeroLayout)
      ? values.hero_video_layout
      : "default"
  ) as HeroLayout;

  const logoBackground = (
    LOGO_BACKGROUND_SHAPES.includes(
      values.hero_logo_background as HeroLogoBackground,
    )
      ? values.hero_logo_background
      : "none"
  ) as HeroLogoBackground;

  const videoLink = String(values.video_link ?? "");
  const logoScale = Number(values.hero_logo_scale ?? 100);
  const logoBackgroundScale = Number(values.hero_logo_background_scale ?? 100);

  const overlayStyle = (
    HERO_OVERLAY_STYLES.includes(values.hero_overlay_style as HeroOverlayStyle)
      ? values.hero_overlay_style
      : "bottom"
  ) as HeroOverlayStyle;
  const overlayOpacity = Number(values.hero_overlay_opacity ?? 75);
  const overlayExtent = Number(values.hero_overlay_extent ?? 50);
  const bottomDivider = (
    HERO_DIVIDERS.includes(values.hero_bottom_divider as HeroDivider)
      ? values.hero_bottom_divider
      : "none"
  ) as HeroDivider | "none";
  const textFrame = Boolean(values.hero_text_frame);

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
        <Grid size={{ xs: 12, sm: 6 }}>
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
                    label: t(LAYOUT_LABEL_KEY[value]),
                  }))}
                />
              </Box>
              <Box flex={1}>
                <Select
                  label={t("heroLogoBackground")}
                  value={logoBackground}
                  onChange={(v) => onChange("hero_logo_background", v)}
                  options={LOGO_BACKGROUND_SHAPES.map((value) => ({
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

            {/* The dark overlay between the video and the text. Its shape,
                strength and reach are one control each; at "none" nothing is
                drawn, so the strength/reach sliders hide rather than sitting
                there with no effect. Hiding them keeps the stored values, so
                turning the overlay back on restores what the tenant had picked.
                The reach slider also hides for "full" (a flat tint has no
                gradient to move). */}
            <Select
              label={t("heroOverlayStyle")}
              value={overlayStyle}
              onChange={(v) => onChange("hero_overlay_style", v)}
              options={HERO_OVERLAY_STYLES.map((value) => ({
                value,
                label: t(OVERLAY_STYLE_LABEL_KEY[value]),
              }))}
            />
            {overlayStyle !== "none" && (
              <Slider
                label={t("heroOverlayOpacity")}
                steps={OVERLAY_OPACITY_STEPS}
                value={overlayOpacity}
                onChange={(v) => onChange("hero_overlay_opacity", Number(v))}
              />
            )}
            {overlayStyle !== "none" && overlayStyle !== "full" && (
              <Slider
                label={t("heroOverlayExtent")}
                steps={OVERLAY_EXTENT_STEPS}
                value={overlayExtent}
                onChange={(v) => onChange("hero_overlay_extent", Number(v))}
              />
            )}
          </Box>
        </Grid>

        {/* ── Column 2: the live preview ── */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={8}>
            <Typography
              as="span"
              variant="label"
              fontWeight={600}
              color="var(--foreground)"
            >
              {t("heroVideoPreview")}
            </Typography>

            {/* Bottom divider: the transparent notch cut into the hero's bottom
                edge so the page (and its watermark) shows through, softening the
                seam. Sits under the Preview header so its effect shows live in
                the hero below - though the notch reveals the plain admin
                background here, not the tenant's watermark. */}
            <Select
              label={t("heroDivider")}
              value={bottomDivider}
              onChange={(v) => onChange("hero_bottom_divider", v)}
              options={HERO_DIVIDERS.map((value) => ({
                value,
                label: t(DIVIDER_LABEL_KEY[value]),
              }))}
            />

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
                overlayStyle={overlayStyle}
                overlayOpacity={overlayOpacity / 100}
                overlayExtent={overlayExtent}
                bottomDivider={bottomDivider}
                bottomDividerElevation={HERO_DIVIDER_ELEVATION}
                contentScale={0.5}
                style={{ height: 240, borderRadius: 10 }}
              />
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Framed section text. Kept out of the two columns above because it does
          NOT apply to the landing hero those preview - only to the section/page
          and item-detail headings. Its own preview renders the real
          `HeroTextFrame`, so it cannot drift from the site. */}
      <Box display="flex" alignItems="center" gap={10}>
        <Switch
          checked={textFrame}
          onChange={(v) => onChange("hero_text_frame", v)}
        />
        <Typography
          as="span"
          variant="body"
          fontWeight={500}
          color="var(--foreground)"
        >
          {t("heroTextFrame")}
        </Typography>
      </Box>
      <Typography variant="body" margin={0}>
        {t("heroTextFrameHint")}
      </Typography>
      {textFrame && (
        <Box flexDirection="column" gap={8} maxWidth={420}>
          <Typography
            as="span"
            variant="label"
            fontWeight={600}
            color="var(--foreground)"
          >
            {t("heroTextFramePreview")}
          </Typography>
          {/* A neutral hero-toned backdrop so the white outline reads, the way it
              sits over a darkened hero image on the real pages. */}
          <Box
            height={170}
            borderRadius={10}
            border="1px solid var(--border)"
            backgroundColor="#4a4a4a"
            alignItems="center"
            justifyContent="center"
            paddingX={16}
            styles={{ position: "relative", overflow: "hidden" }}
          >
            <HeroTextFrame
              image={brandmark ?? null}
              imageAlt={String(values.site_name ?? "")}
            >
              <Typography
                as="span"
                variant="h3"
                color="#fff"
                textAlign="center"
                styles={{
                  lineHeight: 1.25,
                  textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                }}
              >
                {t("heroTextFramePreviewSample")}
              </Typography>
            </HeroTextFrame>
          </Box>
        </Box>
      )}
    </Box>
  );
}
