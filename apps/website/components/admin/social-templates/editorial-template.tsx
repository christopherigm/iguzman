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
 * Editorial: a vertical split - photo on the left, a solid secondary-color
 * column on the right holding the brand, a large display headline and the price.
 * Magazine-cover feel.
 */
export function EditorialTemplate({ data }: { data: FlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  const panel = data.secondaryColor;
  const panelText = contrastText(panel);
  const showDiscount =
    data.includeItemData && (data.discountPercent ?? 0) > 0;

  return (
    <Box
      width={w}
      height={h}
      display="flex"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {/* Photo column */}
      <Box
        width={w * 0.52}
        height="100%"
        styles={{ position: "relative", overflow: "hidden" }}
      >
        <FlyerImage
          src={data.itemImage}
          alt={data.itemName}
          brandColor={data.primaryColor}
        />
        {showDiscount && (
          <Box
            styles={{ position: "absolute", top: 40, left: 40 }}
            padding="14px 26px"
            backgroundColor={data.primaryColor}
          >
            <Typography
              variant="none"
              color={contrastText(data.primaryColor)}
              styles={{ fontSize: 42, fontWeight: 800, lineHeight: 1 }}
            >
              -{data.discountPercent}%
            </Typography>
          </Box>
        )}
      </Box>

      {/* Text column */}
      <Box
        flexGrow={1}
        height="100%"
        backgroundColor={panel}
        padding="64px 52px"
        display="flex"
        flexDirection="column"
        justifyContent="space-between"
      >
        <Box height={90} display="flex" alignItems="center">
          {data.includeBrand && data.brandLogo ? (
            <BrandLogo src={data.brandLogo} height={62} />
          ) : (
            data.includeBrand &&
            data.brandName && (
              <Typography
                variant="none"
                color={panelText}
                styles={{
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                {data.brandName}
              </Typography>
            )
          )}
        </Box>

        <Typography
          variant="none"
          color={panelText}
          styles={{
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.04,
            fontFamily: "var(--font-display, inherit)",
          }}
        >
          {data.imageText || data.itemName || ""}
        </Typography>

        <Box display="flex" flexDirection="column" gap={10}>
          {showDiscount && data.comparePrice != null && (
            <Typography
              variant="none"
              color={panelText}
              styles={{
                fontSize: 34,
                fontWeight: 600,
                textDecoration: "line-through",
                opacity: 0.7,
              }}
            >
              {formatMoney(data.comparePrice, data.currency)}
            </Typography>
          )}
          {data.includeItemData && data.price != null && (
            <Typography
              variant="none"
              color={panelText}
              styles={{ fontSize: 64, fontWeight: 800 }}
            >
              {formatMoney(data.price, data.currency)}
            </Typography>
          )}
          {data.includeBrand && data.brandSlogan && (
            <Typography
              variant="none"
              color={panelText}
              styles={{ fontSize: 28, fontWeight: 500, opacity: 0.85 }}
            >
              {data.brandSlogan}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
