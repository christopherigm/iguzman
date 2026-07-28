"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
// From `lib/fonts`, not `lib/system`: the latter reaches the server-only
// site registry (and `next/headers`), which a "use client" module may not pull in.
import { isGoogleFontUrl, cssFontFamily } from "@/lib/fonts";

type Props = {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

/**
 * "Typography" - the tenant's own typefaces, loaded from Google Fonts.
 *
 * One stylesheet URL carries both families (`css2?family=A&family=B`); the two
 * name fields say which of them is the heading face and which is the body face.
 * The preview loads the *real* stylesheet (React hoists the `<link>` into the
 * document head) and renders the two names, so what the operator sees here is
 * what the site will paint - the same rule as the watermark and hero previews.
 *
 * An invalid URL is shown as a field error and simply produces no preview: the
 * API rejects any host other than Google Fonts, and the site re-checks before
 * rendering the link, so a bad value can never reach a public page.
 */
export function TypographySection({ values, onChange }: Props) {
  const t = useTranslations("Admin");

  const url = String(values.google_font_url ?? "");
  const display = String(values.font_display ?? "");
  const body = String(values.font_body ?? "");

  const urlValid = isGoogleFontUrl(url);
  const displayFamily = cssFontFamily(display);
  const bodyFamily = cssFontFamily(body);
  // The site's own fallback chain, mirrored: a tenant naming only a body face
  // gets it for headings too.
  const previewDisplay = displayFamily ?? bodyFamily;

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
          {t("typographyTitle")}
        </Typography>
      </Box>

      <Typography variant="body" margin={0}>
        {t("typographyIntro")}
      </Typography>

      {/* spacing is in 8px base units, not px - 3 is the 24px gutter. */}
      <Grid container spacing={3}>
        {/* ── Column 1: the controls ── */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={12}>
            <TextInput
              label={t("googleFontUrl")}
              value={url}
              onChange={(v) => onChange("google_font_url", v)}
              helperText={t("googleFontUrlHelp")}
              error={url && !urlValid ? t("googleFontUrlInvalid") : undefined}
              rows={3}
              multirow
            />
            <Box gap={12}>
              <Box flex={1}>
                <TextInput
                  label={t("fontDisplay")}
                  value={display}
                  onChange={(v) => onChange("font_display", v)}
                  helperText={t("fontDisplayHelp")}
                />
              </Box>
              <Box flex={1}>
                <TextInput
                  label={t("fontBody")}
                  value={body}
                  onChange={(v) => onChange("font_body", v)}
                  helperText={t("fontBodyHelp")}
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
              {t("typographyPreview")}
            </Typography>

            {/* React hoists this into <head>, which is the only way the preview
                can render in the families the operator just typed. */}
            {urlValid && <link rel="stylesheet" href={url} />}

            <Box
              flexDirection="column"
              gap={8}
              padding={16}
              backgroundColor="var(--surface-2)"
              borderRadius={10}
            >
              <Typography
                as="span"
                variant="h3"
                margin={0}
                styles={{
                  fontFamily: previewDisplay
                    ? `${previewDisplay}, sans-serif`
                    : undefined,
                }}
              >
                {String(values.site_name || t("typographyPreviewHeading"))}
              </Typography>
              <Typography
                variant="body"
                margin={0}
                styles={{
                  fontFamily: bodyFamily
                    ? `${bodyFamily}, sans-serif`
                    : undefined,
                }}
              >
                {t("typographyPreviewBody")}
              </Typography>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
