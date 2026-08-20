import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  CouponCode,
  CouponLogo,
  CouponQr,
  CouponTarget,
  CouponTerms,
} from "./coupon-parts";
import { FORMAT_DIMENSIONS, tint, type CouponFlyerData } from "./types";

/**
 * Elegant: a hairline rule border on a near-white ground, everything centred and
 * generously spaced.
 *
 * The restrained option, for tenants whose brand would be misrepresented by a
 * shouting discount - a salon, a restaurant, a studio. The brand colour appears
 * only as accents (the rule, the value, the code), never as a filled panel.
 */
export function ElegantTemplate({ data }: { data: CouponFlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  const ink = "#1a1a1a";

  return (
    <Box
      width={w}
      height={h}
      backgroundColor="#faf8f5"
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {/* The double rule: a hairline frame inset from the edge, with a second
          heavier one in the brand colour just inside it. */}
      <Box
        styles={{
          position: "absolute",
          top: 48,
          left: 48,
          right: 48,
          bottom: 48,
          border: `2px solid ${tint(ink, 0.18)}`,
        }}
      />
      <Box
        styles={{
          position: "absolute",
          top: 62,
          left: 62,
          right: 62,
          bottom: 62,
          border: `1px solid ${data.primaryColor}`,
        }}
      />

      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap={34}
        paddingX={120}
        styles={{ position: "relative", boxSizing: "border-box" }}
      >
        {data.includeBrand && data.brandLogo ? (
          <CouponLogo data={data} height={84} />
        ) : data.includeBrand && data.brandName ? (
          <Typography
            variant="none"
            color={ink}
            styles={{ fontSize: 34, fontWeight: 600, letterSpacing: 8 }}
          >
            {data.brandName.toUpperCase()}
          </Typography>
        ) : null}

        <Box
          width={90}
          height={0}
          styles={{ borderTop: `2px solid ${data.secondaryColor}` }}
        />

        <Typography
          variant="none"
          color={data.primaryColor}
          styles={{
            fontSize: 118,
            fontWeight: 300,
            lineHeight: 1,
            textAlign: "center",
            letterSpacing: -1,
          }}
        >
          {data.valueLabel}
        </Typography>

        {data.description ? (
          <Typography
            variant="none"
            color={tint(ink, 0.72)}
            styles={{
              fontSize: 28,
              textAlign: "center",
              lineHeight: 1.5,
              letterSpacing: 0.5,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.description}
          </Typography>
        ) : null}

        {/* ⚠ Its two colours are passed explicitly here. `CouponTarget`'s
            default muted tone is a *lightened* version of its ink, which is
            right on a filled panel and invisible on this template's near-white
            ground - so the name takes the ink and the label a darkened tint of
            it, matching the fine print two rows down. */}
        <CouponTarget
          target={data.target}
          color={ink}
          muted={tint(ink, 0.55)}
          size={108}
        />

        <CouponCode code={data.code} color={data.primaryColor} fontSize={42} />

        <CouponTerms data={data} color={tint(ink, 0.55)} fontSize={26} />

        {data.qrImage || data.qrPlaceholder ? (
          <Box display="flex" flexDirection="column" alignItems="center" gap={12}>
            <CouponQr
              src={data.qrImage}
              placeholder={data.qrPlaceholder}
              size={180}
            />
            {data.landingUrl ? (
              <Typography
                variant="none"
                color={tint(ink, 0.5)}
                styles={{ fontSize: 18, letterSpacing: 0.6 }}
              >
                {data.landingUrl}
              </Typography>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
