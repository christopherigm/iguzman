import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { FlyerImage, BrandLogo } from "./flyer-parts";
import {
  FORMAT_DIMENSIONS,
  contrastText,
  formatMoney,
  type FlyerData,
} from "./types";

/**
 * Classic: photo on top, a solid brand-color band beneath carrying the headline
 * and price. The dependable, always-legible layout.
 */
export function ClassicTemplate({ data }: { data: FlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  const bandText = contrastText(data.primaryColor);
  const showDiscount =
    data.includeItemData && (data.discountPercent ?? 0) > 0;

  return (
    <Box
      width={w}
      height={h}
      backgroundColor="#ffffff"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {/* Photo region */}
      <Box
        width="100%"
        height={h * 0.64}
        styles={{ position: "relative", overflow: "hidden" }}
      >
        <FlyerImage
          src={data.itemImage}
          alt={data.itemName}
          brandColor={data.primaryColor}
        />
        {data.includeBrand && data.brandLogo && (
          <Box
            styles={{ position: "absolute", top: 44, left: 44 }}
            padding="18px 26px"
            borderRadius={16}
            backgroundColor="rgba(255,255,255,0.92)"
          >
            <BrandLogo src={data.brandLogo} height={64} />
          </Box>
        )}
        {showDiscount && (
          <Box
            styles={{ position: "absolute", top: 44, right: 44 }}
            width={160}
            height={160}
            borderRadius={999}
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            backgroundColor={data.secondaryColor}
            color={contrastText(data.secondaryColor)}
          >
            <Typography
              variant="none"
              color={contrastText(data.secondaryColor)}
              styles={{ fontSize: 64, fontWeight: 800, lineHeight: 1 }}
            >
              -{data.discountPercent}%
            </Typography>
          </Box>
        )}
      </Box>

      {/* Brand-color band */}
      <Box
        width="100%"
        height={h * 0.36}
        backgroundColor={data.primaryColor}
        padding="56px 64px"
        display="flex"
        flexDirection="column"
        justifyContent="center"
        gap={24}
      >
        <Typography
          variant="none"
          color={bandText}
          styles={{
            fontSize: 66,
            fontWeight: 800,
            lineHeight: 1.05,
            fontFamily: "var(--font-display, inherit)",
          }}
        >
          {data.imageText || data.itemName || ""}
        </Typography>
        <Box
          display="flex"
          alignItems="baseline"
          justifyContent="space-between"
          gap={24}
          flexWrap="wrap"
        >
          {data.includeItemData && data.price != null && (
            <Box display="flex" alignItems="baseline" gap={20}>
              <Typography
                variant="none"
                color={bandText}
                styles={{ fontSize: 58, fontWeight: 800 }}
              >
                {formatMoney(data.price, data.currency)}
              </Typography>
              {showDiscount && data.comparePrice != null && (
                <Typography
                  variant="none"
                  color={bandText}
                  styles={{
                    fontSize: 38,
                    fontWeight: 600,
                    textDecoration: "line-through",
                    opacity: 0.7,
                  }}
                >
                  {formatMoney(data.comparePrice, data.currency)}
                </Typography>
              )}
            </Box>
          )}
          {data.includeBrand && data.brandName && (
            <Typography
              variant="none"
              color={bandText}
              styles={{ fontSize: 30, fontWeight: 600, opacity: 0.9 }}
            >
              {data.brandName}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
