"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Select } from "@repo/ui/core-elements/select";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  GradientBuilder,
  type GradientBuilderLabels,
} from "@repo/ui/core-elements/gradient-builder";
import { useTheme } from "@repo/ui/theme-provider";
import { SectionBand } from "@/components/section-band";
import { fitSectionBackground } from "@/lib/section-background";
import {
  DIVIDER_OPTIONS,
  DIVIDER_LABEL_KEY,
  toDividerOption,
  type DividerOption,
} from "@/components/admin/divider-options";

/**
 * The page colour behind a band - what a notch reveals on the live site. Read
 * from the same two fields the watermark section edits, so the preview's
 * backdrop follows the CMS theme exactly as the site follows the visitor's.
 *
 * Both CMS pages that own a band (`/admin/featured-spotlight` for the catalog
 * band, `/admin/highlights` for the highlights one) load those fields read-only
 * and keep them out of their payload, so neither can write back a stale copy of
 * /admin/logos-and-styles' work.
 */
export function usePreviewPageBackground(
  values: Record<string, unknown>,
): string {
  const { state } = useTheme();
  return state.resolved === "dark"
    ? String(values.background_dark ?? "#3c3c3c")
    : String(values.background_light ?? "#e5e5e5");
}

type Props = {
  /** Heading for this block of controls (e.g. "Highlights style"). */
  title: string;
  /**
   * Sample heading painted inside the preview band. Defaults to `title`, but a
   * page whose `title` names the *controls* rather than the section passes the
   * section's own name here, so the mock band still reads like the real one.
   */
  previewHeading?: string;
  /** Label for the gradient field itself (e.g. the catalogBg/highlightsBg strings). */
  gradientLabel: string;
  /** System keys this band writes. */
  backgroundKey: string;
  topDividerKey: string;
  bottomDividerKey: string;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

/**
 * One section band's controls, two-up from `sm`: the gradient builder fills the
 * left column, the two edge pickers and the live preview stack down the right.
 * The builder is the tall control, so pairing it with the shapes it frames puts
 * the fill, the edges and the result in one eyeful instead of a long scroll.
 * Below `sm` it stacks in that same reading order.
 *
 * A band is the full-width colour strip a landing paints behind one section
 * (`System.catalog_items_bg` / `highlights_bg`), plus the shape cut as a
 * transparent notch out of its top and bottom edges so the page - and the
 * watermark - shows through instead of a hard straight line.
 *
 * Like the watermark and hero sections, the preview renders the *real*
 * `SectionBand` over the tenant's own page background, so what the operator
 * tunes here cannot drift from what the site paints. Each band lives on the CMS
 * page that owns its section: the catalog band below the featured items on
 * /admin/featured-spotlight, the highlights band below the highlights list on
 * /admin/highlights.
 */
export function SectionBandSection({
  title,
  previewHeading,
  gradientLabel,
  backgroundKey,
  topDividerKey,
  bottomDividerKey,
  values,
  onChange,
}: Props) {
  const t = useTranslations("Admin");
  const tGb = useTranslations("GradientBuilder");
  const pageBackground = usePreviewPageBackground(values);

  const background = String(values[backgroundKey] ?? "");
  const topDivider = toDividerOption(values[topDividerKey]);
  const bottomDivider = toDividerOption(values[bottomDividerKey]);

  const dividerOptions = DIVIDER_OPTIONS.map((value) => ({
    value,
    label: t(DIVIDER_LABEL_KEY[value]),
  }));

  const gradientLabels: GradientBuilderLabels = {
    linear: tGb("linear"),
    radial: tGb("radial"),
    solid: tGb("solid"),
    angle: tGb("angle"),
    color: tGb("color"),
    stops: tGb("stops"),
    addStop: tGb("addStop"),
    removeStop: tGb("removeStop"),
    pickColor: tGb("pickColor"),
    opacity: tGb("opacity"),
    rawCss: tGb("rawCss"),
  };

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
          {title}
        </Typography>
      </Box>

      <Typography variant="body" margin={0}>
        {t("sectionBackgroundsIntro")}
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <GradientBuilder
            label={gradientLabel}
            value={background}
            onChange={(v) => onChange(backgroundKey, v)}
            labels={gradientLabels}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={16}>
            <Box gap={12}>
              <Box flex={1}>
                <Select
                  label={t("sectionTopDivider")}
                  value={topDivider}
                  onChange={(v) => onChange(topDividerKey, v as DividerOption)}
                  options={dividerOptions}
                />
              </Box>
              <Box flex={1}>
                <Select
                  label={t("sectionBottomDivider")}
                  value={bottomDivider}
                  onChange={(v) =>
                    onChange(bottomDividerKey, v as DividerOption)
                  }
                  options={dividerOptions}
                />
              </Box>
            </Box>

            {/* The preview paints the tenant's own page background *behind* the
                band, because that - not a neutral panel - is what a notch
                reveals on the site. It renders the real `SectionBand`, and puts
                the band's value through `fitSectionBackground` exactly as the
                landings do, so a radial gradient previews with the same ellipse
                fit the site draws. */}
            <Box
              backgroundColor={pageBackground}
              borderRadius={10}
              border="1px solid var(--border)"
              paddingY={20}
              styles={{ overflow: "hidden" }}
            >
              <SectionBand
                background={fitSectionBackground(background || "transparent")}
                topDivider={topDivider}
                bottomDivider={bottomDivider}
              >
                <Box
                  flexDirection="column"
                  gap={10}
                  paddingX={16}
                  paddingY={60}
                >
                  <Typography as="span" variant="h5" color="var(--foreground)">
                    {previewHeading ?? title}
                  </Typography>
                  <Box gap={10}>
                    <Box
                      flex={1}
                      height={44}
                      borderRadius={8}
                      border="1px solid var(--border)"
                      backgroundColor="var(--surface-1)"
                    />
                    <Box
                      flex={1}
                      height={44}
                      borderRadius={8}
                      border="1px solid var(--border)"
                      backgroundColor="var(--surface-1)"
                    />
                  </Box>
                </Box>
              </SectionBand>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
