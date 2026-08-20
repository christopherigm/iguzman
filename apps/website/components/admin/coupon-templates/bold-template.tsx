import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  CouponBackdrop,
  CouponCode,
  CouponLogo,
  CouponQr,
  CouponTarget,
  CouponTerms,
} from "./coupon-parts";
import { FORMAT_DIMENSIONS, contrastText, type CouponFlyerData } from "./types";

/**
 * Bold: the offer at maximum size over a full-bleed backdrop, with the QR
 * anchored bottom-right.
 *
 * The one to reach for when the flyer will be seen small and in passing - a
 * feed, a story, a poster read from across a room. Everything but the number is
 * subordinate to it.
 */
export function BoldTemplate({ data }: { data: CouponFlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  // Over a photo the text is always white; over the gradient fallback it follows
  // the brand colour it is actually sitting on.
  const text = data.backgroundImage ? "#ffffff" : contrastText(data.primaryColor);

  return (
    <Box
      width={w}
      height={h}
      styles={{ position: "relative", overflow: "hidden" }}
    >
      <CouponBackdrop data={data} scrim={0.66} />

      <Box
        width="100%"
        height="100%"
        display="flex"
        flexDirection="column"
        justifyContent="space-between"
        padding={80}
        styles={{ position: "relative", boxSizing: "border-box" }}
      >
        {/* Top: the brand */}
        <Box display="flex" alignItems="center" gap={24}>
          {data.includeBrand && data.brandLogo ? (
            <CouponLogo data={data} height={80} />
          ) : null}
          {data.includeBrand && !data.brandLogo && data.brandName ? (
            <Typography
              variant="none"
              color={text}
              styles={{ fontSize: 38, fontWeight: 800, letterSpacing: 1 }}
            >
              {data.brandName}
            </Typography>
          ) : null}
        </Box>

        {/* Middle: the offer, as large as the canvas allows */}
        <Box display="flex" flexDirection="column" gap={22}>
          <Typography
            variant="none"
            color={data.secondaryColor}
            styles={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: 8,
              textTransform: "uppercase",
            }}
          >
            {data.brandSlogan ?? ""}
          </Typography>
          <Typography
            variant="none"
            color={text}
            styles={{
              fontSize: 200,
              fontWeight: 900,
              lineHeight: 0.86,
              letterSpacing: -6,
            }}
          >
            {data.valueLabel}
          </Typography>
          {data.description ? (
            <Typography
              variant="none"
              color={text}
              styles={{
                fontSize: 34,
                lineHeight: 1.3,
                opacity: 0.9,
                maxWidth: w * 0.7,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {data.description}
            </Typography>
          ) : null}

          {/* Ranged left with the rest of this column. On this template the
              target's photograph is usually also the backdrop, so the thumbnail
              is what tells the reader the picture is the offer rather than
              decoration. */}
          <CouponTarget
            target={data.target}
            color={text}
            size={116}
            align="start"
          />
        </Box>

        {/* Bottom: the code on the left, the QR on the right */}
        <Box
          display="flex"
          alignItems="flex-end"
          justifyContent="space-between"
          gap={40}
        >
          <Box display="flex" flexDirection="column" gap={18} alignItems="flex-start">
            <CouponCode
              code={data.code}
              color={text}
              background="rgba(0,0,0,0.28)"
              fontSize={46}
            />
            <CouponTerms data={data} color={text} />
          </Box>
          <CouponQr
            src={data.qrImage}
            placeholder={data.qrPlaceholder}
            size={230}
          />
        </Box>
      </Box>
    </Box>
  );
}
