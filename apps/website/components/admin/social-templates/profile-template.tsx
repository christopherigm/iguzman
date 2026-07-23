import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  heroLogoBackgroundStyle,
  heroLogoMaskStyle,
  HERO_BADGE_SHADOW,
} from "@repo/ui/hero";
import { FlyerImage, BrandLogo, brandLogoSlotHeight } from "./flyer-parts";
import {
  FORMAT_DIMENSIONS,
  contrastText,
  formatMoney,
  tint,
  type BadgeShape,
  type FlyerData,
} from "./types";

/**
 * The composition's fixed budget, in canvas px. The two text regions are given
 * exact heights and the badge takes whatever is left, so the stack always sums
 * to the canvas at *either* format - a badge sized as a plain fraction of the
 * canvas fits 4x5 but overflows the shorter 1x1. Both regions clip their own
 * text (see the clamps below), so an over-long headline shrinks nothing and
 * pushes nothing off the bottom.
 */
const HEADER_H = 150;
const FOOTER_H = 230;
const GAP = 28;
const PAD_X = 72;

/** Clamp a text block to a fixed number of lines, so it can't exceed its budget. */
function clampLines(lines: number) {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical" as const,
    WebkitLineClamp: lines,
    overflow: "hidden",
  };
}

/**
 * Image centered ("profile"): a full-bleed backdrop with the brand at the top,
 * the item photo centred in a shaped badge - the flyer's subject, framed like a
 * profile picture - and the headline and price beneath it.
 *
 * The only template that paints `backgroundImage`, and the only one that badges
 * the photo, so it is the one the badge shape and the two scale sliders drive.
 * With no backdrop it falls back to a brand-colour gradient rather than
 * rendering an empty frame.
 */
export function ProfileTemplate({ data }: { data: FlyerData }) {
  const { w, h } = FORMAT_DIMENSIONS[data.format];
  const hasBackdrop = Boolean(data.backgroundImage);

  // Over a photo the text can't rely on a known ground, so it goes white with a
  // scrim and a shadow behind it. Over the brand gradient the ground *is* known,
  // so `contrastText` picks the legible ink and nothing is darkened.
  const ink = hasBackdrop ? "#ffffff" : contrastText(data.primaryColor);
  const textShadow = hasBackdrop ? "0 2px 14px rgba(0,0,0,0.55)" : undefined;

  // The `logo` shape clips to the brand logo's own alpha; with no logo to cut it
  // from there is nothing to shape, so it falls back to the plain disc.
  const shape: BadgeShape =
    data.badgeShape === "logo" && !data.brandLogo ? "circle" : data.badgeShape;
  const shapeStyle =
    shape === "logo" && data.brandLogo
      ? heroLogoMaskStyle(data.brandLogo)
      : heroLogoBackgroundStyle(shape);

  const padY = Math.round(h * 0.05);
  // The brand block is the one region whose content can outgrow its budget: a
  // scaled-up logo plate is taller than HEADER_H and the block clips. It takes
  // the extra height out of the badge's share below - the stack still sums to
  // the canvas, and the badge is the part that can afford to give.
  const headerH = Math.max(HEADER_H, brandLogoSlotHeight(data, 104));
  const badgeMax = Math.min(
    w - PAD_X * 2,
    h - padY * 2 - headerH - FOOTER_H - GAP * 2,
  );
  const badgeSize = badgeMax * (data.badgeScale / 100);
  // 100% is an edge-to-edge fill; below it the photo shrinks about the centre
  // and the badge's own colour shows through as a ring - the same relationship
  // the hero's profile badge has between its plate and the logo inside it.
  const photoSize = badgeSize * (data.badgeImageScale / 100);

  const showDiscount = data.includeItemData && (data.discountPercent ?? 0) > 0;
  const headline = data.imageText || data.itemName || "";

  return (
    <Box
      width={w}
      height={h}
      backgroundColor={data.primaryColor}
      styles={{
        position: "relative",
        overflow: "hidden",
        ...(hasBackdrop
          ? {}
          : {
              backgroundImage: `linear-gradient(160deg, ${data.primaryColor} 0%, ${data.secondaryColor} 100%)`,
            }),
      }}
    >
      {hasBackdrop && (
        <>
          <FlyerImage
            src={data.backgroundImage}
            alt=""
            brandColor={data.primaryColor}
          />
          {/* Darkest at the edges where the brand block and the headline sit,
              lightest across the middle so the badge's subject stays bright. */}
          <Box
            styles={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 38%, rgba(0,0,0,0.15) 62%, rgba(0,0,0,0.62) 100%)",
            }}
          />
        </>
      )}

      <Box
        width="100%"
        height="100%"
        padding={`${padY}px ${PAD_X}px`}
        display="flex"
        flexDirection="column"
        alignItems="center"
        // Centred rather than space-between: a badge scaled below 100% should
        // pull the composition together, not leave a hole in the middle.
        justifyContent="center"
        gap={GAP}
        styles={{ position: "relative" }}
      >
        {/* ── Brand block ── */}
        <Box
          height={headerH}
          width="100%"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={10}
          styles={{ flexShrink: 0, overflow: "hidden" }}
        >
          {data.includeBrand && data.brandLogo && (
            <BrandLogo data={data} height={104} />
          )}
          {data.includeBrand && !data.brandLogo && data.brandName && (
            <Typography
              variant="none"
              color={ink}
              textAlign="center"
              styles={{
                fontSize: 60,
                fontWeight: 800,
                lineHeight: 1.1,
                fontFamily: "var(--font-display, inherit)",
                textShadow,
                ...clampLines(1),
              }}
            >
              {data.brandName}
            </Typography>
          )}
          {data.includeBrand && data.brandSlogan && (
            <Typography
              variant="none"
              color={ink}
              textAlign="center"
              styles={{
                fontSize: 26,
                fontWeight: 600,
                lineHeight: 1.3,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                textShadow,
                ...clampLines(1),
              }}
            >
              {data.brandSlogan}
            </Typography>
          )}
        </Box>

        {/* ── The centred, framed photo ── */}
        <Box
          width={badgeSize}
          height={badgeSize}
          alignItems="center"
          justifyContent="center"
          // Transparent for "none": that option means the bare photo, with no
          // plate showing behind it however far the photo is scaled down.
          backgroundColor={
            shape === "none" ? "transparent" : data.secondaryColor
          }
          styles={{
            ...shapeStyle,
            // A drop-shadow filter, not `elevation`: a box-shadow is clipped
            // away by the polygon shapes and traces the box rather than the
            // mask, so those badges would render flat. Same reasoning as the
            // hero badge, which is why they share the constant.
            filter: HERO_BADGE_SHADOW,
            flexShrink: 0,
          }}
        >
          <Box
            width={photoSize}
            height={photoSize}
            styles={{
              position: "relative",
              overflow: "hidden",
              ...shapeStyle,
            }}
          >
            <FlyerImage
              src={data.itemImage}
              alt={data.itemName}
              brandColor={data.secondaryColor}
            />
          </Box>
        </Box>

        {/* ── Headline + price ── */}
        <Box
          height={FOOTER_H}
          width="100%"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={18}
          styles={{ flexShrink: 0, overflow: "hidden" }}
        >
          {headline && (
            <Typography
              variant="none"
              color={ink}
              textAlign="center"
              styles={{
                fontSize: 62,
                fontWeight: 800,
                lineHeight: 1.05,
                fontFamily: "var(--font-display, inherit)",
                textShadow,
                ...clampLines(2),
              }}
            >
              {headline}
            </Typography>
          )}
          {data.includeItemData && data.price != null && (
            <Box
              display="flex"
              alignItems="baseline"
              justifyContent="center"
              gap={22}
              flexWrap="wrap"
            >
              <Typography
                variant="none"
                color={ink}
                styles={{ fontSize: 58, fontWeight: 800, textShadow }}
              >
                {formatMoney(data.price, data.currency)}
              </Typography>
              {showDiscount && data.comparePrice != null && (
                <Typography
                  variant="none"
                  color={ink}
                  styles={{
                    fontSize: 36,
                    fontWeight: 600,
                    textDecoration: "line-through",
                    opacity: 0.75,
                    textShadow,
                  }}
                >
                  {formatMoney(data.comparePrice, data.currency)}
                </Typography>
              )}
              {showDiscount && (
                <Box
                  padding="8px 24px"
                  borderRadius={999}
                  backgroundColor={data.secondaryColor}
                >
                  <Typography
                    variant="none"
                    color={contrastText(data.secondaryColor)}
                    styles={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1 }}
                  >
                    -{data.discountPercent}%
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* A hairline inset frame, echoing the border a print flyer carries. Drawn
          last so it sits over the backdrop but never under the text. */}
      <Box
        styles={{
          position: "absolute",
          top: 28,
          right: 28,
          bottom: 28,
          left: 28,
          border: `2px solid ${tint(hasBackdrop ? "#ffffff" : data.secondaryColor, 0.35)}`,
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}
