"use client";

import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Slider, type SliderStep } from "@repo/ui/core-elements/slider";
import { ColorField } from "./color-field";

/** Logo-fill percentages the user can pick from (the rest becomes padding). */
const SCALE_STEPS: SliderStep[] = [50, 60, 70, 80, 90, 100].map((v) => ({
  value: v,
  label: `${v}%`,
}));

interface Props {
  /** The logo being turned into assets (data URI), for the live preview. */
  logo?: string;
  /** Background color painted behind the manifest icons. */
  background: string;
  onBackgroundChange: (value: string) => void;
  /** Percent of each icon the logo fills; the remainder is padding. */
  logoScale: number;
  onLogoScaleChange: (value: number) => void;
  /** True while the assets are being generated (disables the confirm button). */
  generating: boolean;
  okCallback: () => void;
  cancelCallback: () => void;
}

/**
 * Second-step dialog shown after the user confirms generating assets from a new
 * logo. It collects the manifest icons' background color and logo padding, and
 * previews the result as an installed web-app icon (rounded, masked square).
 *
 * The favicon is deliberately excluded from these settings - it stays
 * transparent and edge-to-edge; see `logoToAssets`.
 */
export function ManifestAssetsModal({
  logo,
  background,
  onBackgroundChange,
  logoScale,
  onLogoScaleChange,
  generating,
  okCallback,
  cancelCallback,
}: Props) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");

  return (
    <ConfirmationModal
      title={t("manifestOptionsTitle")}
      text={t("manifestOptionsText")}
      okCallback={okCallback}
      cancelCallback={cancelCallback}
      okLabel={tCommon("ok")}
      cancelLabel={tCommon("cancel")}
      okDisabled={generating}
      panelMaxWidth="480px"
    >
      <Box flexDirection="column" gap={20}>
        {/* Installed web-app icon preview: rounded square (the OS mask), the
            chosen background behind, and the logo padded to `logoScale`. */}
        <Box flexDirection="column" alignItems="center" gap={8}>
          <Box
            width={120}
            height={120}
            borderRadius={26}
            backgroundColor={background}
            alignItems="center"
            justifyContent="center"
            styles={{
              overflow: "hidden",
              boxShadow: "0 6px 18px rgba(0, 0, 0, 0.22)",
            }}
          >
            {logo && (
              <Box
                width={`${logoScale}%`}
                height={`${logoScale}%`}
                styles={{
                  backgroundImage: `url("${logo}")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                  backgroundSize: "contain",
                }}
              />
            )}
          </Box>
          <Typography
            as="span"
            variant="caption"
            color="var(--foreground-muted, #888)"
          >
            {t("manifestPreviewCaption")}
          </Typography>
        </Box>

        <ColorField
          id="manifest-background"
          label={t("manifestBackground")}
          value={background}
          onChange={onBackgroundChange}
          fallback="#ffffff"
        />

        <Slider
          label={t("manifestLogoSize")}
          steps={SCALE_STEPS}
          value={logoScale}
          onChange={(v) => onLogoScaleChange(Number(v))}
        />

        {generating && (
          <Typography variant="body">{t("generatingAssets")}</Typography>
        )}
      </Box>
    </ConfirmationModal>
  );
}
