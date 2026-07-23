import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { FlyerImage, BrandLogo, brandLogoSlotHeight } from "./flyer-parts";
import {
  FORMAT_DIMENSIONS,
  contrastText,
  formatMoney,
  type FlyerData,
} from "./types";

/**
 * Sale: a promo layout on a solid brand background - the photo in a rounded
 * card, a big discount disc, and the price with its strikethrough compare price.
 * Loud and conversion-first. Best paired with an item that has a discount.
 */
export function SaleTemplate({ data }: { data: FlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  const bg = data.primaryColor;
  const onBg = contrastText(bg);
  const showDiscount =
    data.includeItemData && (data.discountPercent ?? 0) > 0;
  // The header keeps its 90px rhythm until the logo's plate outgrows it; a fixed
  // row would let a scaled-up plate spill into the photo card below.
  const headerH = Math.max(90, brandLogoSlotHeight(data, 70));

  return (
    <Box
      width={w}
      height={h}
      backgroundColor={bg}
      padding="60px"
      display="flex"
      flexDirection="column"
      gap={40}
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {/* Header */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        height={headerH}
        styles={{ flexShrink: 0 }}
      >
        {data.includeBrand && data.brandLogo ? (
          <BrandLogo data={data} height={70} />
        ) : (
          <span />
        )}
        <Typography
          variant="none"
          color={onBg}
          styles={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
          }}
        >
          {data.imageText ? "" : "Sale"}
        </Typography>
      </Box>

      {/* Photo card */}
      <Box
        flexGrow={1}
        borderRadius={36}
        styles={{ position: "relative", overflow: "hidden" }}
        backgroundColor="#ffffff"
      >
        <FlyerImage
          src={data.itemImage}
          alt={data.itemName}
          brandColor={data.secondaryColor}
        />
        {showDiscount && (
          <Box
            styles={{ position: "absolute", top: 40, right: 40 }}
            width={220}
            height={220}
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
              styles={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}
            >
              SAVE
            </Typography>
            <Typography
              variant="none"
              color={contrastText(data.secondaryColor)}
              styles={{ fontSize: 88, fontWeight: 800, lineHeight: 1 }}
            >
              {data.discountPercent}%
            </Typography>
          </Box>
        )}
      </Box>

      {/* Footer: headline + price */}
      <Box
        display="flex"
        alignItems="flex-end"
        justifyContent="space-between"
        gap={28}
      >
        <Typography
          variant="none"
          color={onBg}
          styles={{
            fontSize: 60,
            fontWeight: 800,
            lineHeight: 1.02,
            fontFamily: "var(--font-display, inherit)",
            flex: "1 1 auto",
          }}
        >
          {data.imageText || data.itemName || ""}
        </Typography>
        {data.includeItemData && data.price != null && (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="flex-end"
            styles={{ flexShrink: 0 }}
          >
            {showDiscount && data.comparePrice != null && (
              <Typography
                variant="none"
                color={onBg}
                styles={{
                  fontSize: 38,
                  fontWeight: 600,
                  textDecoration: "line-through",
                  opacity: 0.75,
                }}
              >
                {formatMoney(data.comparePrice, data.currency)}
              </Typography>
            )}
            <Typography
              variant="none"
              color={onBg}
              styles={{ fontSize: 76, fontWeight: 800, lineHeight: 1 }}
            >
              {formatMoney(data.price, data.currency)}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
