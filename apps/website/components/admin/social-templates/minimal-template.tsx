import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { FlyerImage, BrandLogo, brandLogoSlotHeight } from "./flyer-parts";
import {
  FORMAT_DIMENSIONS,
  formatMoney,
  type FlyerData,
} from "./types";

/**
 * Minimal: generous white space, the photo in a centered framed panel, thin
 * rules, quiet type. Elegant and editorial-light.
 */
export function MinimalTemplate({ data }: { data: FlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  const ink = "#161616";
  const showDiscount =
    data.includeItemData && (data.discountPercent ?? 0) > 0;
  // The 110px logo row grows only when the logo's plate outgrows it; the framed
  // photo panel below has flexGrow, so it yields the height rather than overflow.
  const logoRowH = Math.max(110, brandLogoSlotHeight(data, 68));

  return (
    <Box
      width={w}
      height={h}
      backgroundColor="#f6f4f0"
      padding="64px"
      display="flex"
      flexDirection="column"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {/* Top: logo, centered */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        height={logoRowH}
        styles={{ flexShrink: 0 }}
      >
        {data.includeBrand && data.brandLogo ? (
          <BrandLogo data={data} height={68} />
        ) : (
          data.includeBrand &&
          data.brandName && (
            <Typography
              variant="none"
              color={ink}
              styles={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              {data.brandName}
            </Typography>
          )
        )}
      </Box>

      {/* Framed photo */}
      <Box
        flexGrow={1}
        marginTop={20}
        marginBottom={40}
        styles={{ position: "relative", overflow: "hidden" }}
        border={`2px solid ${data.primaryColor}`}
      >
        <FlyerImage
          src={data.itemImage}
          alt={data.itemName}
          brandColor={data.primaryColor}
        />
      </Box>

      {/* Caption block */}
      <Box display="flex" flexDirection="column" alignItems="center" gap={22}>
        <Typography
          variant="none"
          color={ink}
          textAlign="center"
          styles={{
            fontSize: 56,
            fontWeight: 500,
            lineHeight: 1.1,
            fontFamily: "var(--font-display, inherit)",
          }}
        >
          {data.imageText || data.itemName || ""}
        </Typography>
        {data.includeItemData && data.price != null && (
          <Box display="flex" alignItems="baseline" gap={18}>
            <Typography
              variant="none"
              color={data.primaryColor}
              styles={{ fontSize: 46, fontWeight: 700, letterSpacing: "0.04em" }}
            >
              {formatMoney(data.price, data.currency)}
            </Typography>
            {showDiscount && data.comparePrice != null && (
              <Typography
                variant="none"
                color={ink}
                styles={{
                  fontSize: 32,
                  fontWeight: 500,
                  textDecoration: "line-through",
                  opacity: 0.5,
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
