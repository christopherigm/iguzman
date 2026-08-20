import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  heroLogoBackgroundStyle,
  heroLogoMaskStyle,
  HERO_BADGE_SHADOW,
} from "@repo/ui/hero";
import { tint, type CouponFlyerData, type CouponFlyerTarget } from "./types";

/**
 * The plate behind the brand logo is always white, for the same reason the
 * social flyer's is: a lockup's backing is what makes a mark read against
 * whatever it is sitting on, and white is the one ground that cannot clash with
 * the logo it frames.
 */
const BRAND_PLATE_COLOR = "#ffffff";

/**
 * The plate and the logo, each as a multiple of the height the template asked
 * the logo to draw at. They are the same number on purpose, so that at both
 * sliders' 100% the logo fills the plate edge to edge - there is no built-in
 * padding to fight, and a ring around the mark is asked for by turning the logo
 * slider down rather than baked in here.
 *
 * ⚠ **These are deliberately not the social flyer's 3.5 / 0.9.** There the base
 * height is a small design token; here it is the drawn logo height itself, so
 * reusing those numbers would more than triple the logo on every coupon.
 */
const BRAND_PLATE_BASE = 2;
const BRAND_LOGO_BASE = 2;

/**
 * The height the brand lockup actually occupies - the scaled bare logo with no
 * plate, the scaled plate with one. Exported so a template that needs to
 * reserve a slot for the logo can size that slot with the same number.
 */
export function couponLogoSlotHeight(
  data: CouponFlyerData,
  height: number,
): number {
  if (!data.brandLogo) return 0;
  if (data.brandLogoBackground === "none")
    return Math.round(height * BRAND_LOGO_BASE * (data.brandLogoScale / 100));
  return Math.round(
    height * BRAND_PLATE_BASE * (data.brandLogoBackgroundScale / 100),
  );
}

/**
 * The tenant's logo, optionally on a shaped plate.
 *
 * With `brandLogoBackground: "none"` (the default) it is the bare logo at the
 * template's own height, scaled by `brandLogoScale`. With a shape it becomes a
 * square plate - shaped by the hero's own `heroLogoBackgroundStyle` /
 * `heroLogoMaskStyle`, so a shape cannot come out different here than it does
 * on the site or on a social post - sized by `brandLogoBackgroundScale`, with
 * the logo contained inside it at `brandLogoScale`.
 *
 * Rendered through `next/image unoptimized` (never a bare `<img>`, per the app
 * image rule); the data URL means there is nothing to optimize anyway.
 */
export function CouponLogo({
  data,
  height = 72,
}: {
  data: CouponFlyerData;
  height?: number;
}) {
  const src = data.brandLogo;
  if (!src) return null;

  const shape = data.brandLogoBackground;
  if (shape === "none") {
    const logoHeight = couponLogoSlotHeight(data, height);
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

  const badgeSize = couponLogoSlotHeight(data, height);
  // At 100% the logo *is* the plate: no inset, so the mark occupies the whole
  // background. Anything less leaves a ring of plate showing around it.
  const logoSize = Math.round(badgeSize * (data.brandLogoScale / 100));
  // The `logo` shape clips the plate to the logo's own alpha rather than to a
  // geometric outline, so the plate reads as a halo in the mark's own shape.
  const shapeStyle =
    shape === "logo" ? heroLogoMaskStyle(src) : heroLogoBackgroundStyle(shape);

  return (
    <Box
      width={badgeSize}
      height={badgeSize}
      alignItems="center"
      justifyContent="center"
      backgroundColor={BRAND_PLATE_COLOR}
      styles={{
        ...shapeStyle,
        // A drop-shadow filter, not `elevation`: a box-shadow is clipped away by
        // the polygon shapes and traces the box rather than the mask, so those
        // plates would render flat. Same reasoning - and the same constant - as
        // the hero badge and the social flyer's own logo plate.
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

/**
 * The coupon's QR code on a white tile.
 *
 * **The white ground is not decoration.** A QR needs its quiet zone and hard
 * black-on-white contrast to lock on; drawn straight onto a brand-coloured panel
 * it becomes a symbol that photographs badly under a shop's lighting, which for
 * the one element the whole flyer exists to deliver is the worst thing it could
 * be. The stored PNG already carries a 4-module border, and this tile's padding
 * widens it.
 *
 * Renders nothing when there is no code **and** no `placeholder` - a coupon
 * whose PNG write failed is still a working coupon, and a broken image box would
 * be worse than an absence. An *unsaved* coupon is the other case entirely: its
 * QR does not exist yet but is about to, so the form passes `placeholder` and
 * the space the symbol will fill is drawn as a dashed tile saying so, rather
 * than as a hole the author has no way to read as temporary.
 */
export function CouponQr({
  src,
  size = 260,
  label,
  placeholder,
}: {
  src?: string;
  size?: number;
  label?: string;
  placeholder?: string;
}) {
  if (!src && !placeholder) return null;
  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={10}>
      <Box
        padding={14}
        borderRadius={16}
        backgroundColor="#ffffff"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        {src ? (
          <Image
            src={src}
            alt=""
            width={size}
            height={size}
            unoptimized
            style={{ width: size, height: size, display: "block" }}
          />
        ) : (
          <CouponQrPlaceholder size={size} label={placeholder ?? ""} />
        )}
      </Box>
      {label ? (
        <Typography
          variant="none"
          color="rgba(255,255,255,0.85)"
          styles={{ fontSize: 20, letterSpacing: 0.4 }}
        >
          {label}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * The square the QR will occupy once the coupon has been saved: a dashed
 * outline with the reason written inside it, drawn at exactly the size the real
 * symbol gets so the layout the author is judging is the layout they will
 * download.
 *
 * Always dark-on-white, whatever the template around it is doing, because it
 * stands in for something that is always dark-on-white (see `CouponQr`) - a
 * placeholder that inverted with the template would misrepresent the space it
 * is reserving.
 *
 * The copy is passed in rather than composed here: this file is rendered inside
 * the CMS, and every string a tenant reads there comes from the app's own
 * message catalogue.
 */
export function CouponQrPlaceholder({
  size,
  label,
}: {
  size: number;
  label: string;
}) {
  return (
    <Box
      width={size}
      height={size}
      display="flex"
      alignItems="center"
      justifyContent="center"
      padding={size * 0.1}
      borderRadius={12}
      backgroundColor="#ffffff"
      border="3px dashed rgba(17,17,17,0.35)"
      styles={{ boxSizing: "border-box" }}
    >
      <Typography
        variant="none"
        color="rgba(17,17,17,0.55)"
        // Sized off the tile so the sentence fits whether the template gives the
        // QR 180px (elegant) or 620px (scan).
        styles={{
          fontSize: Math.max(14, Math.round(size * 0.09)),
          textAlign: "center",
          lineHeight: 1.35,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

/**
 * The code itself, in a dashed box - the visual convention for "type this in"
 * that tells a reader at a glance which string on the flyer is the one that goes
 * in the box at checkout.
 *
 * Monospace with wide tracking because this is read off paper and typed back:
 * the whole job here is telling 0 from O and 1 from l, which a proportional face
 * at a distance does not.
 */
export function CouponCode({
  code,
  color,
  background,
  fontSize = 56,
}: {
  code: string;
  color: string;
  background?: string;
  fontSize?: number;
}) {
  return (
    <Box
      paddingY={18}
      paddingX={36}
      borderRadius={14}
      backgroundColor={background ?? "transparent"}
      border={`3px dashed ${color}`}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Typography
        variant="none"
        color={color}
        styles={{
          fontSize,
          fontWeight: 800,
          letterSpacing: 6,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          lineHeight: 1,
        }}
      >
        {code}
      </Typography>
    </Box>
  );
}

/**
 * The full-bleed backdrop a template may paint, with a scrim over it.
 *
 * The scrim is not optional and not a taste call: every template puts white or
 * near-white text over this, and an uploaded photo is whatever the tenant
 * happened to upload. Without a guaranteed floor of darkness a light photo
 * renders the entire offer invisible - and unlike a web page, a flyer that comes
 * out illegible is discovered after it has been printed.
 */
export function CouponBackdrop({
  data,
  scrim = 0.62,
}: {
  data: CouponFlyerData;
  scrim?: number;
}) {
  // The operator's own upload wins; a scoped coupon's target photograph fills in
  // behind it. A coupon for one dish over a picture of that dish is the flyer an
  // operator would have built by hand, and it costs them an upload they have
  // already made once in the catalog. The gradient stays the last resort, so an
  // order-wide coupon with no upload looks exactly as it always did.
  const backdrop = data.backgroundImage ?? data.target?.image;
  return (
    <>
      {backdrop ? (
        <Image
          src={backdrop}
          alt=""
          fill
          unoptimized
          sizes="1080px"
          style={{ objectFit: "cover" }}
        />
      ) : null}
      <Box
        styles={{
          position: "absolute",
          inset: 0,
          background: backdrop
            ? `rgba(0,0,0,${scrim})`
            : `linear-gradient(160deg, ${data.primaryColor} 0%, ${tint(
                data.secondaryColor,
                0.95,
              )} 100%)`,
        }}
      />
    </>
  );
}

/**
 * The thumbnail that says what a scoped coupon is for: the item's or category's
 * photograph in a round frame, its name beneath, under a "Valid on" line.
 *
 * Rendered by all four templates, sized and coloured by each - a coupon for one
 * dish is a different promise from a coupon for everything, and the flyer has to
 * say which without the customer reading the terms. It renders **nothing** for
 * an order-wide coupon, which is the contract every optional part here follows.
 *
 * ⚠ It survives a target with no photograph, and that is the common case rather
 * than an edge one - plenty of categories are never given a picture. The frame
 * is dropped entirely rather than drawn empty, because a blank circle beside a
 * name reads as an image that failed to load.
 */
export function CouponTarget({
  target,
  color,
  size = 132,
  align = "center",
  muted,
}: {
  target?: CouponFlyerTarget;
  /** The ink this sits on, so each template keeps its own contrast decision. */
  color: string;
  /** Diameter of the photo frame in canvas px. */
  size?: number;
  align?: "center" | "start";
  /**
   * Colour of the "Valid on" line. Defaults to a faded `color`, which is right
   * on a filled panel; a template on a near-white ground passes its own.
   */
  muted?: string;
}) {
  if (!target) return null;
  const label = muted ?? tint(color, 0.35);

  return (
    <Box
      display="flex"
      alignItems="center"
      gap={22}
      styles={{
        maxWidth: "100%",
        justifyContent: align === "center" ? "center" : "flex-start",
      }}
    >
      {target.image ? (
        <Box
          width={size}
          height={size}
          borderRadius={999}
          styles={{
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
            // A hairline of the surrounding ink, so a photograph whose edges are
            // near the flyer's own colour still reads as a framed object rather
            // than a shape bleeding into the panel.
            boxShadow: `0 0 0 4px ${tint(color, 0.55)}`,
          }}
        >
          <Image
            src={target.image}
            alt=""
            fill
            unoptimized
            sizes="200px"
            style={{ objectFit: "cover" }}
          />
        </Box>
      ) : null}

      <Box
        display="flex"
        flexDirection="column"
        gap={4}
        styles={{ minWidth: 0, textAlign: align === "center" ? "left" : "left" }}
      >
        <Typography
          variant="none"
          color={label}
          styles={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {target.label}
        </Typography>
        <Typography
          variant="none"
          color={color}
          styles={{
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1.2,
            // One line: the name sits under a value label that must stay the
            // largest thing on the flyer, and a three-line category name would
            // push it off a 1x1 canvas.
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {target.name}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * The fine print under an offer: expiry, minimum spend, and anything else that
 * qualifies it. Joined with a separator rather than stacked, so a coupon with
 * both conditions does not push the code off the layout.
 *
 * "Fine print" is relative: at 30px on a 1080px canvas this is still the
 * smallest text on the flyer, but it is the line that decides whether a
 * customer walks in this week - and it was being set small enough to disappear
 * on a poster read from more than arm's length.
 */
export function CouponTerms({
  data,
  color,
  fontSize = 30,
}: {
  data: CouponFlyerData;
  color: string;
  fontSize?: number;
}) {
  const terms = [data.minOrderLabel, data.expiryLabel].filter(Boolean);
  if (terms.length === 0) return null;
  return (
    <Typography
      variant="none"
      color={color}
      styles={{ fontSize, textAlign: "center", lineHeight: 1.4 }}
    >
      {terms.join("  ·  ")}
    </Typography>
  );
}
