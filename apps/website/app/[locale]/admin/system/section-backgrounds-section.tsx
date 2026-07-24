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

type BandProps = {
  /** Name of the section this band sits behind - also the preview's sample heading. */
  title: string;
  /** Label for the gradient field itself (the existing catalogBg/highlightsBg strings). */
  gradientLabel: string;
  background: string;
  onBackgroundChange: (value: string) => void;
  topDivider: DividerOption;
  bottomDivider: DividerOption;
  onTopDividerChange: (value: DividerOption) => void;
  onBottomDividerChange: (value: DividerOption) => void;
  /** The page color behind the band - what a notch reveals on the live site. */
  pageBackground: string;
  labels: GradientBuilderLabels;
};

/**
 * One band's controls: a live preview, the two edge pickers, then the gradient
 * builder. The dividers sit *above* the gradient because they frame it - the
 * operator picks the band's shape, then fills it.
 */
function BandControls({
  title,
  gradientLabel,
  background,
  onBackgroundChange,
  topDivider,
  bottomDivider,
  onTopDividerChange,
  onBottomDividerChange,
  pageBackground,
  labels,
}: BandProps) {
  const t = useTranslations("Admin");

  const dividerOptions = DIVIDER_OPTIONS.map((value) => ({
    value,
    label: t(DIVIDER_LABEL_KEY[value]),
  }));

  return (
    <Box flexDirection="column" gap={12}>
      <Typography
        as="span"
        variant="label"
        fontWeight={600}
        color="var(--foreground)"
      >
        {title}
      </Typography>


      <Box gap={12}>
        <Box flex={1}>
          <Select
            label={t("sectionTopDivider")}
            value={topDivider}
            onChange={(v) => onTopDividerChange(v as DividerOption)}
            options={dividerOptions}
          />
        </Box>
        <Box flex={1}>
          <Select
            label={t("sectionBottomDivider")}
            value={bottomDivider}
            onChange={(v) => onBottomDividerChange(v as DividerOption)}
            options={dividerOptions}
          />
        </Box>
      </Box>

      {/* The preview paints the tenant's own page background *behind* the band,
          because that - not a neutral panel - is what a notch reveals on the
          site. It renders the real `SectionBand`, and puts the band's value
          through `fitSectionBackground` exactly as the landings do, so a radial
          gradient previews with the same ellipse fit the site draws. */}
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
          <Box flexDirection="column" gap={10} paddingX={16} paddingY={60}>
            <Typography as="span" variant="h5" color="var(--foreground)">
              {title}
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

      <GradientBuilder
        label={gradientLabel}
        value={background}
        onChange={onBackgroundChange}
        labels={labels}
      />
    </Box>
  );
}

type Props = {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

/**
 * "Section backgrounds" - the two full-width bands the landing paints behind the
 * Catalog Items and Company Highlights sections: each band's CSS background plus
 * the shape cut as a transparent notch out of its top and bottom edges, so the
 * page (and its watermark) shows through and the band dissolves into the
 * sections around it.
 *
 * Like the watermark and hero sections, the preview renders the *real*
 * `SectionBand` over the tenant's own page background, so what the operator
 * tunes here cannot drift from what the site paints. It sits directly below
 * "Watermark & Background" because a notch reveals exactly that background.
 */
export function SectionBackgroundsSection({ values, onChange }: Props) {
  const t = useTranslations("Admin");
  const tGb = useTranslations("GradientBuilder");
  const { state } = useTheme();
  const isDark = state.resolved === "dark";

  /** Shared by both builders - same strings, same namespace. */
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

  // The same two fields the watermark section edits, read here so the preview's
  // backdrop follows the CMS theme exactly as the site follows the visitor's.
  const pageBackground = isDark
    ? String(values.background_dark ?? "#3c3c3c")
    : String(values.background_light ?? "#e5e5e5");

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
          {t("sectionBackgroundsTitle")}
        </Typography>
      </Box>

      <Typography variant="body" margin={0}>
        {t("sectionBackgroundsIntro")}
      </Typography>

      {/* spacing is in 8px base units, not px - 3 is the 24px gutter. */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <BandControls
            title={t("sectionBackgroundsCatalog")}
            gradientLabel={t("catalogBg")}
            background={String(values.catalog_items_bg ?? "")}
            onBackgroundChange={(v) => onChange("catalog_items_bg", v)}
            topDivider={toDividerOption(values.catalog_top_divider)}
            bottomDivider={toDividerOption(values.catalog_bottom_divider)}
            onTopDividerChange={(v) => onChange("catalog_top_divider", v)}
            onBottomDividerChange={(v) => onChange("catalog_bottom_divider", v)}
            pageBackground={pageBackground}
            labels={gradientLabels}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <BandControls
            title={t("sectionBackgroundsHighlights")}
            gradientLabel={t("highlightsBg")}
            background={String(values.highlights_bg ?? "")}
            onBackgroundChange={(v) => onChange("highlights_bg", v)}
            topDivider={toDividerOption(values.highlights_top_divider)}
            bottomDivider={toDividerOption(values.highlights_bottom_divider)}
            onTopDividerChange={(v) => onChange("highlights_top_divider", v)}
            onBottomDividerChange={(v) =>
              onChange("highlights_bottom_divider", v)
            }
            pageBackground={pageBackground}
            labels={gradientLabels}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
