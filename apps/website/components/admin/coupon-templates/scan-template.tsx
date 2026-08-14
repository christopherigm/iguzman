import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  CouponCode,
  CouponLogo,
  CouponQrPlaceholder,
  CouponTerms,
} from "./coupon-parts";
import Image from "next/image";
import {
  FORMAT_DIMENSIONS,
  contrastText,
  tint,
  type CouponFlyerData,
} from "./types";

/**
 * Scan: the QR is the flyer. A giant code on white, the offer stated above it,
 * a brand-coloured footer beneath.
 *
 * For the surfaces where the scan *is* the call to action - a table tent, a
 * window sticker, a slide behind a counter - rather than something a reader
 * types in later. It is the only template that sizes the QR off the canvas, so
 * it stays scannable from a metre away.
 */
export function ScanTemplate({ data }: { data: CouponFlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  const onBrand = contrastText(data.primaryColor);
  const footerHeight = h * 0.2;
  // The QR gets whatever the canvas can spare after the header and footer, so a
  // 4x5 flyer prints a bigger symbol than a square one instead of both being
  // capped at the square's budget.
  const qrSize = Math.min(w * 0.62, h - footerHeight - h * 0.42);

  return (
    <Box
      width={w}
      height={h}
      backgroundColor="#ffffff"
      display="flex"
      flexDirection="column"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {/* ── Header: what the scan is worth ── */}
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap={16}
        paddingTop={64}
        paddingX={70}
        styles={{ boxSizing: "border-box" }}
      >
        {data.includeBrand && data.brandLogo ? (
          <CouponLogo data={data} height={70} />
        ) : null}
        <Typography
          variant="none"
          color={data.primaryColor}
          styles={{
            fontSize: 104,
            fontWeight: 900,
            lineHeight: 1,
            textAlign: "center",
            letterSpacing: -2,
          }}
        >
          {data.valueLabel}
        </Typography>
        {data.description ? (
          <Typography
            variant="none"
            color={tint("#111111", 0.65)}
            styles={{
              fontSize: 28,
              textAlign: "center",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.description}
          </Typography>
        ) : null}
      </Box>

      {/* ── The QR, as large as the canvas allows ──
          Drawn directly rather than through `CouponQr`: that part wraps its code
          in a white tile for contrast against a coloured panel, and here the
          whole page is already white - the tile would be an invisible box adding
          padding that eats into the size this template exists to maximise. */}
      <Box
        flex={1}
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap={20}
      >
        {data.qrImage ? (
          <Image
            src={data.qrImage}
            alt=""
            width={qrSize}
            height={qrSize}
            unoptimized
            style={{ width: qrSize, height: qrSize, display: "block" }}
          />
        ) : data.qrPlaceholder ? (
          // Not saved yet. This template *is* the QR, so the placeholder takes
          // the symbol's full budget - anything smaller would preview a layout
          // the download will not produce.
          <CouponQrPlaceholder size={qrSize} label={data.qrPlaceholder} />
        ) : (
          // No stored PNG: the code is the only thing left that works, so it
          // takes the space the symbol would have had rather than leaving a hole.
          <CouponCode
            code={data.code}
            color={data.primaryColor}
            fontSize={72}
          />
        )}
        {data.qrImage || data.qrPlaceholder ? (
          <CouponCode
            code={data.code}
            color={tint("#111111", 0.85)}
            fontSize={38}
          />
        ) : null}
        <CouponTerms data={data} color={tint("#111111", 0.55)} />
      </Box>

      {/* ── Footer: who it is from ── */}
      <Box
        width="100%"
        height={footerHeight}
        backgroundColor={data.primaryColor}
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap={8}
        paddingX={60}
        styles={{ boxSizing: "border-box" }}
      >
        {data.brandName ? (
          <Typography
            variant="none"
            color={onBrand}
            styles={{ fontSize: 40, fontWeight: 800, letterSpacing: 2 }}
          >
            {data.brandName}
          </Typography>
        ) : null}
        {data.landingUrl ? (
          <Typography
            variant="none"
            color={onBrand}
            styles={{ fontSize: 22, opacity: 0.85, wordBreak: "break-all" }}
          >
            {data.landingUrl}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
