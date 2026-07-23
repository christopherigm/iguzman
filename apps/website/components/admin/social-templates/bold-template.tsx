import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { FlyerImage, BrandLogo } from "./flyer-parts";
import {
  FORMAT_DIMENSIONS,
  contrastText,
  formatMoney,
  tint,
  type FlyerData,
} from "./types";

/**
 * Bold: full-bleed photo under a heavy bottom-up gradient in the brand color,
 * with an oversized headline and a floating price pill. High-impact, dark.
 */
export function BoldTemplate({ data }: { data: FlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  const showDiscount =
    data.includeItemData && (data.discountPercent ?? 0) > 0;

  return (
    <Box
      width={w}
      height={h}
      backgroundColor="#0a0a0a"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      <FlyerImage
        src={data.itemImage}
        alt={data.itemName}
        brandColor={data.primaryColor}
      />

      {/* Brand-tinted gradient scrim for legibility */}
      <Box
        styles={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to top, ${tint(
            data.primaryColor,
            0.95,
          )} 0%, ${tint(data.primaryColor, 0.5)} 32%, rgba(0,0,0,0) 62%)`,
        }}
      />

      {/* Top row: logo + discount */}
      <Box
        styles={{ position: "absolute", top: 48, left: 48, right: 48 }}
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
      >
        {data.includeBrand && data.brandLogo ? (
          <BrandLogo data={data} height={72} />
        ) : (
          <span />
        )}
        {showDiscount && (
          <Box
            padding="16px 30px"
            borderRadius={999}
            backgroundColor={data.secondaryColor}
          >
            <Typography
              variant="none"
              color={contrastText(data.secondaryColor)}
              styles={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}
            >
              -{data.discountPercent}%
            </Typography>
          </Box>
        )}
      </Box>

      {/* Bottom stack */}
      <Box
        styles={{ position: "absolute", left: 64, right: 64, bottom: 72 }}
        display="flex"
        flexDirection="column"
        gap={30}
      >
        <Typography
          variant="none"
          color="#ffffff"
          styles={{
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1.0,
            fontFamily: "var(--font-display, inherit)",
            textShadow: "0 2px 24px rgba(0,0,0,0.35)",
          }}
        >
          {data.imageText || data.itemName || ""}
        </Typography>
        {data.includeItemData && data.price != null && (
          <Box display="flex" alignItems="baseline" gap={22}>
            <Box
              padding="16px 34px"
              borderRadius={18}
              backgroundColor="#ffffff"
            >
              <Typography
                variant="none"
                color="#111111"
                styles={{ fontSize: 56, fontWeight: 800 }}
              >
                {formatMoney(data.price, data.currency)}
              </Typography>
            </Box>
            {showDiscount && data.comparePrice != null && (
              <Typography
                variant="none"
                color="#ffffff"
                styles={{
                  fontSize: 40,
                  fontWeight: 600,
                  textDecoration: "line-through",
                  opacity: 0.8,
                }}
              >
                {formatMoney(data.comparePrice, data.currency)}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
