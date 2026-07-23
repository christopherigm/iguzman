import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  heroLogoBackgroundStyle,
  heroLogoMaskStyle,
  HERO_BADGE_SHADOW,
} from "@repo/ui/hero";
import { tint, type FlyerData } from "./types";

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

/**
 * The plate behind the brand logo is always white: a logo lockup's backing is
 * what makes the mark read over a busy photo, and white is the one ground that
 * works against any logo's own colours (a brand-coloured plate can clash with
 * the very logo it is framing).
 */
const BRAND_BADGE_PLATE = "#ffffff";

/**
 * How much of the plate the logo may occupy at 100%. Not 1: the shape is a
 * `clip-path`, which clips *descendants* too, so a logo drawn out to the plate's
 * square bounds would have its ends cut off by every non-square shape. 0.72 is
 * just inside a circle's inscribed square (0.707), which is the tightest of the
 * rounded shapes.
 */
const BRAND_LOGO_INSET = 0.9;

/**
 * How much bigger the plate is than the bare logo it replaces, at 100%. A plate
 * only *contains* its logo (see `BRAND_LOGO_INSET`), so drawn at the bare logo's
 * own height it reads smaller than no plate at all - which is what it did until
 * this constant existed. At 3.4 the lockup is a bit over three times the
 * template's bare-logo height; the slider's 50% floor is still larger than the
 * pre-plate size, so every stop on it is a usable size.
 *
 * Every template's logo slot is sized from this (via `brandLogoSlotHeight`), so
 * raising it is the one place to make the brand read larger everywhere.
 */
const BRAND_PLATE_BASE = 3.5;

/**
 * How tall a *bare* logo draws at 100%, as a multiple of the template's base
 * height - deliberately the size the same logo has *inside* a plate, so the
 * shape control changes the backing and not the brand's size. Drawn at the
 * template's own `height` instead (what it did before this constant existed) a
 * bare logo came out a third of its plated self, which reads as the plate being
 * the only way to get a legible logo rather than as a styling choice.
 */
const BARE_LOGO_BASE = BRAND_PLATE_BASE * BRAND_LOGO_INSET;

/**
 * The height the brand lockup actually draws at - the scaled bare logo with no
 * plate, the scaled plate with one. Both branches are `brandLogoScale`-aware, so
 * the slider sizes the brand in either mode.
 *
 * Templates that give the logo a fixed slot must size that slot with this, not
 * with the `height` they pass: the lockup is the taller of the two and would
 * otherwise overflow its row (or be clipped outright, as `profile`'s is).
 */
export function brandLogoSlotHeight(data: FlyerData, height: number): number {
  if (!data.brandLogo) return height;
  if (data.brandLogoBackground === "none")
    return Math.round(height * BARE_LOGO_BASE * (data.brandLogoScale / 100));
  return Math.round(
    height * BRAND_PLATE_BASE * (data.brandLogoBackgroundScale / 100),
  );
}

/**
 * The brand logo, optionally on a shaped plate.
 *
 * With `brandLogoBackground: "none"` (the default) it is the bare logo, keeping
 * aspect, drawn at the size it would have inside a plate (`BARE_LOGO_BASE`) and
 * scaled by `brandLogoScale` - a logo still needs sizing when there is no plate
 * to size for it.
 * With a shape it becomes a square plate - shaped by the hero's own
 * `heroLogoBackgroundStyle` / `heroLogoMaskStyle`, so a shape can't come out
 * different here than it does on the site - sized by `brandLogoBackgroundScale`,
 * with the logo contained inside it at `brandLogoScale`. Each template passes
 * its own base `height`; the two scales are the tenant's tuning on top.
 *
 * Rendered from a data URL via `next/image unoptimized` (never a bare `<img>`,
 * per the app image rule; the data URL means there is nothing to optimize).
 */
export function BrandLogo({
  data,
  height = 90,
}: {
  data: FlyerData;
  height?: number;
}) {
  const src = data.brandLogo;
  if (!src) return null;

  const shape = data.brandLogoBackground;
  if (shape === "none") {
    const logoHeight = brandLogoSlotHeight(data, height);
    return (
      <Image
        src={src}
        alt=""
        width={logoHeight * 4}
        height={logoHeight}
        unoptimized
        style={{ height: logoHeight, width: "auto", objectFit: "contain" }}
      />
    );
  }

  // Rounded (inside the helper) because it ends up as `next/image` width/height,
  // which want ints. Every template that boxes its logo sizes that box with the
  // same helper, so the plate always has the room it asks for.
  const badgeSize = brandLogoSlotHeight(data, height);
  // 100% is as large as the logo goes inside the plate; below that it shrinks
  // about the centre and a wider ring of plate shows around it - the same
  // relationship the hero's badge has between its plate and the logo inside it.
  const logoSize = Math.round(
    badgeSize * BRAND_LOGO_INSET * (data.brandLogoScale / 100),
  );
  // The `logo` shape clips the plate to the logo's own alpha instead of a
  // geometric outline, so the plate reads as a halo in the mark's own shape.
  const shapeStyle =
    shape === "logo" ? heroLogoMaskStyle(src) : heroLogoBackgroundStyle(shape);

  return (
    <Box
      width={badgeSize}
      height={badgeSize}
      alignItems="center"
      justifyContent="center"
      backgroundColor={BRAND_BADGE_PLATE}
      styles={{
        ...shapeStyle,
        // A drop-shadow filter, not `elevation`: a box-shadow is clipped away by
        // the polygon shapes and traces the box rather than the mask, so those
        // plates would render flat. Same reasoning - and the same constant - as
        // the hero badge and the centred item badge.
        filter: HERO_BADGE_SHADOW,
        flexShrink: 0,
      }}
    >
      <Image
        src={src}
        alt=""
        width={logoSize}
        height={logoSize}
        unoptimized
        style={{ width: logoSize, height: logoSize, objectFit: "contain" }}
      />
    </Box>
  );
}
