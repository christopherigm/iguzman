import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { CouponCode, CouponLogo, CouponQr, CouponTerms } from "./coupon-parts";
import {
  FORMAT_DIMENSIONS,
  contrastText,
  tint,
  type CouponFlyerData,
} from "./types";

/**
 * Ticket: the classic tear-off stub. A brand-coloured body carrying the offer,
 * a dashed perforation across it, and a white counterfoil holding the QR.
 *
 * The default template because it is the one that reads as a coupon at a glance,
 * before a word of it is read - which is what makes someone pick it up off a
 * counter in the first place.
 */
export function TicketTemplate({ data }: { data: CouponFlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  const onBrand = contrastText(data.primaryColor);
  // The stub holds the QR, which needs a white ground to scan reliably (see
  // `CouponQr`), so the whole counterfoil is white and its text goes dark.
  const stubHeight = h * 0.34;

  return (
    <Box
      width={w}
      height={h}
      backgroundColor={data.primaryColor}
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {/* ── Body: the offer ── */}
      <Box
        width="100%"
        height={h - stubHeight}
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap={28}
        paddingX={80}
        styles={{ boxSizing: "border-box" }}
      >
        {data.includeBrand && data.brandLogo ? (
          <CouponLogo data={data} height={78} />
        ) : data.includeBrand && data.brandName ? (
          <Typography
            variant="none"
            color={onBrand}
            styles={{ fontSize: 34, fontWeight: 700, letterSpacing: 2 }}
          >
            {data.brandName}
          </Typography>
        ) : null}

        <Typography
          variant="none"
          color={onBrand}
          styles={{
            fontSize: 140,
            fontWeight: 900,
            lineHeight: 0.95,
            textAlign: "center",
            letterSpacing: -2,
          }}
        >
          {data.valueLabel}
        </Typography>

        {data.description ? (
          <Typography
            variant="none"
            color={onBrand}
            styles={{
              fontSize: 30,
              textAlign: "center",
              lineHeight: 1.35,
              opacity: 0.92,
              // Two lines of the tenant's own sentence; a third would push the
              // value label off a 1x1 canvas.
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.description}
          </Typography>
        ) : null}

        <CouponCode code={data.code} color={onBrand} fontSize={48} />
        <CouponTerms data={data} color={onBrand} />
      </Box>

      {/* ── The perforation ──
          Two notches biting into the edges plus a dashed rule between them. The
          notches are painted in the *page* colour rather than being real holes:
          the flyer is exported as a JPG, which has no alpha, so a transparent
          cut-out would come out as a black bite taken from the ticket. */}
      <Box
        styles={{
          position: "absolute",
          top: h - stubHeight,
          left: 0,
          width: "100%",
          height: 0,
        }}
      >
        <Box
          width={56}
          height={56}
          borderRadius={999}
          backgroundColor="#ffffff"
          styles={{ position: "absolute", left: -28, top: -28 }}
        />
        <Box
          width={56}
          height={56}
          borderRadius={999}
          backgroundColor="#ffffff"
          styles={{ position: "absolute", right: -28, top: -28 }}
        />
        <Box
          styles={{
            position: "absolute",
            left: 44,
            right: 44,
            top: -2,
            height: 0,
            borderTop: `4px dashed ${tint(onBrand, 0.45)}`,
          }}
        />
      </Box>

      {/* ── Counterfoil: the QR ── */}
      <Box
        width="100%"
        height={stubHeight}
        backgroundColor="#ffffff"
        display="flex"
        alignItems="center"
        justifyContent="center"
        gap={44}
        paddingX={70}
        styles={{ boxSizing: "border-box" }}
      >
        {data.qrImage || data.qrPlaceholder ? (
          <Box
            padding={10}
            borderRadius={12}
            backgroundColor="#ffffff"
            styles={{ flexShrink: 0 }}
          >
            <CouponQr
              src={data.qrImage}
              placeholder={data.qrPlaceholder}
              size={stubHeight * 0.68}
            />
          </Box>
        ) : null}
        <Box display="flex" flexDirection="column" gap={10}>
          <Typography
            variant="none"
            color="#111111"
            styles={{ fontSize: 30, fontWeight: 800, letterSpacing: 1 }}
          >
            {data.brandName ?? ""}
          </Typography>
          {data.landingUrl ? (
            <Typography
              variant="none"
              color={data.primaryColor}
              styles={{ fontSize: 22, wordBreak: "break-all", lineHeight: 1.3 }}
            >
              {data.landingUrl}
            </Typography>
          ) : null}
          {data.brandSlogan ? (
            <Typography
              variant="none"
              color="rgba(17,17,17,0.6)"
              styles={{ fontSize: 20, lineHeight: 1.3 }}
            >
              {data.brandSlogan}
            </Typography>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
