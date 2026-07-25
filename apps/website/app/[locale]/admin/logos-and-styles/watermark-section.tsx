"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Slider, type SliderStep } from "@repo/ui/core-elements/slider";
import { Switch } from "@repo/ui/core-elements/switch";
import { Typography } from "@repo/ui/core-elements/typography";
import { useTheme } from "@repo/ui/theme-provider";
import { ThemeSwitch } from "@repo/ui/theme-switch";
import { LogoWatermark } from "@/components/logo-watermark";
import { ColorField } from "./color-field";
import Card from "@repo/ui/core-elements/card";

/**
 * The slider stops. Deliberately coarse: this is a watermark, and a 1-px or
 * 1-degree granularity would only offer differences nobody can see. Every range
 * matches the bounds the API validates, so the CMS cannot compose a value the
 * backend then rejects.
 */
const ROTATION_STEPS: SliderStep[] = [
  -45, -30, -20, -12, 0, 12, 20, 30, 45,
].map((v) => ({ value: v, label: `${v}°` }));
const SPACING_STEPS: SliderStep[] = [0, 20, 40, 70, 100, 140, 200].map((v) => ({
  value: v,
  label: String(v),
}));
const SIZE_STEPS: SliderStep[] = [40, 60, 80, 120, 160, 220, 300].map((v) => ({
  value: v,
  label: String(v),
}));
const OPACITY_STEPS: SliderStep[] = [1, 2, 3, 4, 6, 8, 12, 18, 25].map((v) => ({
  value: v,
  label: `${v}%`,
}));

/** Snaps a stored value onto the nearest stop, so an off-grid value still shows. */
function nearest(steps: SliderStep[], value: number): number {
  return steps.reduce(
    (best, step) => {
      const v = Number(step.value);
      return Math.abs(v - value) < Math.abs(best - value) ? v : best;
    },
    Number(steps[0]?.value ?? 0),
  );
}

type Props = {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** URL of the logo to preview - the pending upload if there is one. */
  logo: string;
  /**
   * URL of the brandmark to preview - the pending upload if there is one, else
   * undefined when the tenant has not uploaded one. Its presence is what shows
   * the "Use brandmark" switch, and it is what the preview tiles when that
   * switch is on.
   */
  brandmark?: string;
};

/**
 * "Watermark & Background" - the tenant's logo tiled faintly behind every
 * public page, and the page background it sits on.
 *
 * The preview renders the real `LogoWatermark`, not a lookalike, so what the
 * operator tunes here cannot drift from what the site paints. Its surface color
 * follows the CMS's own theme, which is also which of the two background
 * pickers it is showing.
 */
export function WatermarkSection({ values, onChange, logo, brandmark }: Props) {
  const t = useTranslations("Admin");
  const { state } = useTheme();
  const isDark = state.resolved === "dark";

  const enabled = Boolean(values.watermark_enabled);
  const intercalated = Boolean(values.watermark_intercalated);
  const showLogo = Boolean(values.watermark_show_logo);
  // The brandmark can only be shown when one has been uploaded, matching how the
  // public site resolves it in the locale layout.
  const showBrandmark = Boolean(values.watermark_show_brandmark) && !!brandmark;
  // Resolve exactly what the site tiles: both on -> intercalate logo + brandmark;
  // one on -> that image; neither -> nothing (an empty layer).
  const primaryImage = showLogo ? logo : showBrandmark ? brandmark : undefined;
  const secondaryImage = showLogo && showBrandmark ? brandmark : undefined;
  const rotation = Number(values.watermark_rotation ?? -12);
  const spacing = Number(values.watermark_spacing ?? 70);
  const size = Number(values.watermark_size ?? 120);
  const opacity = Number(values.watermark_opacity ?? 4);
  const backgroundLight = String(values.background_light ?? "#e5e5e5");
  const backgroundDark = String(values.background_dark ?? "#3c3c3c");

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
          {t("watermarkTitle")}
        </Typography>
      </Box>

      <Typography variant="body" margin={0}>
        {t("watermarkIntro")}
      </Typography>

      {/* Outside the two columns: they govern both of them. The intercalate
          toggle sits in the same row and only bites while the watermark is on. */}
      <Box display="flex" alignItems="center" gap={24} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={10}>
          <Switch
            checked={enabled}
            onChange={(v) => onChange("watermark_enabled", v)}
          />
          <Typography
            as="span"
            variant="body"
            fontWeight={500}
            color="var(--foreground)"
          >
            {t("watermarkEnabled")}
          </Typography>
        </Box>

        {/* Which images tile: the logo, the brandmark, or both intercalated.
            Both switches sit right beside the enable toggle and only bite while
            the watermark is on. */}
        <Box display="flex" alignItems="center" gap={10}>
          <Switch
            checked={showLogo}
            disabled={!enabled}
            onChange={(v) => onChange("watermark_show_logo", v)}
          />
          <Typography
            as="span"
            variant="body"
            fontWeight={500}
            color={
              enabled ? "var(--foreground)" : "var(--muted-foreground, #6b7280)"
            }
          >
            {t("watermarkShowLogo")}
          </Typography>
        </Box>

        {/* Only offered once a brandmark exists; otherwise there is nothing to
            tile. */}
        {brandmark && (
          <Box display="flex" alignItems="center" gap={10}>
            <Switch
              checked={showBrandmark}
              disabled={!enabled}
              onChange={(v) => onChange("watermark_show_brandmark", v)}
            />
            <Typography
              as="span"
              variant="body"
              fontWeight={500}
              color={
                enabled
                  ? "var(--foreground)"
                  : "var(--muted-foreground, #6b7280)"
              }
            >
              {t("watermarkShowBrandmark")}
            </Typography>
          </Box>
        )}

        <Box display="flex" alignItems="center" gap={10}>
          <Switch
            checked={intercalated}
            disabled={!enabled}
            onChange={(v) => onChange("watermark_intercalated", v)}
          />
          <Typography
            as="span"
            variant="body"
            fontWeight={500}
            color={
              enabled ? "var(--foreground)" : "var(--muted-foreground, #6b7280)"
            }
          >
            {t("watermarkIntercalated")}
          </Typography>
        </Box>
      </Box>

      {/* spacing is in 8px base units, not px - 3 is the 24px gutter. */}
      <Grid container spacing={3}>
        {/* ── Column 1: the controls ── */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={16}>
            {enabled && (
              <>
                <Slider
                  label={t("watermarkRotation")}
                  steps={ROTATION_STEPS}
                  value={nearest(ROTATION_STEPS, rotation)}
                  onChange={(v) => onChange("watermark_rotation", Number(v))}
                />
                <Slider
                  label={t("watermarkSpacing")}
                  steps={SPACING_STEPS}
                  value={nearest(SPACING_STEPS, spacing)}
                  onChange={(v) => onChange("watermark_spacing", Number(v))}
                />
                <Slider
                  label={t("watermarkSize")}
                  steps={SIZE_STEPS}
                  value={nearest(SIZE_STEPS, size)}
                  onChange={(v) => onChange("watermark_size", Number(v))}
                />
                <Slider
                  label={t("watermarkOpacity")}
                  steps={OPACITY_STEPS}
                  value={nearest(OPACITY_STEPS, opacity)}
                  onChange={(v) => onChange("watermark_opacity", Number(v))}
                />
              </>
            )}

            {/* Both backgrounds stay editable with the watermark off - they are
                the page's own color, not part of the pattern. */}
            <Box display="flex" gap={12} flexWrap="wrap">
              <Box flex={1} minWidth={160}>
                <ColorField
                  id="field-background_light"
                  label={t("backgroundLight")}
                  value={backgroundLight}
                  onChange={(v) => onChange("background_light", v)}
                  fallback="#e5e5e5"
                  active={!isDark}
                />
              </Box>
              <Box flex={1} minWidth={160}>
                <ColorField
                  id="field-background_dark"
                  label={t("backgroundDark")}
                  value={backgroundDark}
                  onChange={(v) => onChange("background_dark", v)}
                  fallback="#3c3c3c"
                  active={isDark}
                />
              </Box>
            </Box>
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
              {t("watermarkPreview")}
            </Typography>

            <Box
              height={320}
              borderRadius={10}
              border="1px solid var(--border)"
              backgroundColor={isDark ? backgroundDark : backgroundLight}
              styles={{ position: "relative", overflow: "hidden" }}
            >
              {enabled && primaryImage && (
                <LogoWatermark
                  inline
                  logo={primaryImage}
                  secondaryLogo={secondaryImage}
                  size={size}
                  spacing={spacing}
                  rotation={rotation}
                  intercalated={intercalated}
                  opacity={opacity}
                />
              )}
              {/* A stand-in for page content, so the operator can judge the
                  pattern against text and a card rather than against nothing. */}
              <Box
                flexDirection="column"
                gap={10}
                padding={20}
                styles={{ position: "relative" }}
              >
                <Typography as="span" variant="h4" color="var(--foreground)">
                  {t("watermarkPreviewHeading")}
                </Typography>
                <Typography variant="body" margin={0}>
                  {t("watermarkPreviewBody")}
                </Typography>
                <Box
                  height={72}
                  borderRadius={8}
                  border="1px solid var(--border)"
                  backgroundColor="var(--surface-1)"
                />
                <Card height={72}></Card>
              </Box>
            </Box>

            <Typography variant="caption" margin={0} textAlign="center">
              {t("watermarkPreviewThemeHint")}
            </Typography>

            {/* The real switch, not a preview-only toggle: it flips the whole
                CMS theme, which is what decides which of the two backgrounds
                the preview is painting. */}
            <Box justifyContent="center">
              <ThemeSwitch />
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
