import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { tint } from "./types";

/**
 * The item photo, cover-filling its parent. Rendered from a data URL via
 * `next/image unoptimized` (never a bare `<img>`, per the app image rule; the
 * data URL means there is nothing to optimize anyway). Falls back to a muted
 * panel when no image is set, so a template never shows a broken box.
 */
export function FlyerImage({
  src,
  alt,
  brandColor,
}: {
  src?: string;
  alt?: string;
  brandColor?: string;
}) {
  if (!src) {
    return (
      <Box
        width="100%"
        height="100%"
        display="flex"
        alignItems="center"
        justifyContent="center"
        backgroundColor={tint(brandColor, 0.12)}
        styles={{ position: "absolute", inset: 0 }}
      >
        <Typography
          variant="none"
          color={tint(brandColor, 0.5)}
          styles={{ fontSize: 40, fontWeight: 700 }}
        >
          {alt || "—"}
        </Typography>
      </Box>
    );
  }
  return (
    <Image
      src={src}
      alt={alt ?? ""}
      fill
      unoptimized
      sizes="1080px"
      style={{ objectFit: "cover" }}
    />
  );
}

/** The brand logo drawn at a fixed height, keeping aspect (data URL, unoptimized). */
export function BrandLogo({
  src,
  height = 90,
}: {
  src?: string;
  height?: number;
}) {
  if (!src) return null;
  return (
    <Image
      src={src}
      alt=""
      width={height * 4}
      height={height}
      unoptimized
      style={{ height, width: "auto", objectFit: "contain" }}
    />
  );
}
