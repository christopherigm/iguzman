"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { HeroVideo } from "@repo/ui/hero-video";
import { ParallaxLayer } from "@repo/ui/parallax-layer";
import {
  heroLogoBackgroundStyle,
  heroLogoMaskStyle,
  heroOverlayBackground,
  HeroTextFrame,
  HERO_BADGE_PLATE,
  HERO_BADGE_SHADOW,
} from "@repo/ui/hero";
import type {
  HeroLayout,
  HeroLogoBackground,
  HeroOverlayStyle,
} from "@repo/ui/hero";

/**
 * Diameter of the `profile` logo circle. Smaller than the landing `Hero`'s,
 * because this hero is itself shorter - the same disc would dominate it.
 */
const PROFILE_LOGO_SIZE = "clamp(115px, 14vw, 192px)";

interface ItemHeroVideoProps {
  /** YouTube, Vimeo or direct video URL. */
  url: string;
  /** Item name - used as the fullscreen dialog's heading. */
  title: string;
  /** Drift the video against the page as it scrolls, matching the landing `Hero`. */
  parallax?: boolean;
  /**
   * How the logo and title are composed over the video - the tenant's
   * `System.hero_video_layout`. @default "default"
   */
  layout?: HeroLayout;
  /** Logo shown in the badge of the `profile` layout (`System.img_logo_hero`). */
  logo?: string | null;
  /** Alt text for the logo - the site name. */
  logoAlt?: string;
  /**
   * Shape of the badge behind the logo (`System.hero_logo_background`). `none`
   * removes the badge, so a `profile` layout falls back to the plain title-only
   * hero. @default "none"
   */
  shape?: HeroLogoBackground;
  /**
   * Drawn size of the logo inside the circle as a fraction of the disc
   * (`System.hero_logo_scale / 100`). `1` is the edge-to-edge `cover` fill; a
   * smaller value shrinks the logo about the disc's centre. @default 1
   */
  logoScale?: number;
  /**
   * Drawn size of the badge itself as a fraction of its default diameter
   * (`System.hero_logo_background_scale / 100`). `1` is the full size; a smaller
   * value shrinks the whole badge about its centre. @default 1
   */
  backgroundScale?: number;
  /**
   * Shape of the dark overlay over the video (`System.hero_overlay_style`). The
   * default is the gradient this hero has always drawn. @default "bottom"
   */
  overlayStyle?: HeroOverlayStyle;
  /**
   * Strength (0-1) of the darkest part of the overlay
   * (`System.hero_overlay_opacity / 100`). @default 0.75
   */
  overlayOpacity?: number;
  /**
   * How far the gradient overlay reaches across the frame, 0-100
   * (`System.hero_overlay_extent`); 50 reproduces the historical reach. @default 50
   */
  overlayExtent?: number;
  /**
   * Wrap the title in an outline frame (`System.hero_text_frame`). When on, the
   * title is centred over the video (rather than sitting at the bottom edge) and
   * the fullscreen control moves to the top-right corner. @default false
   */
  frame?: boolean;
  /** Brandmark shown in the frame's top circle (`System.img_brandmark`). */
  brandmark?: string | null;
  /** Alt text for the frame's brandmark - the site name. */
  brandmarkAlt?: string;
}

/**
 * Full-bleed autoplaying hero video for a product/service detail page, sized to
 * match the landing page's `Hero`. Muted and controlless inline (browsers only
 * autoplay muted video); the fullscreen button reopens it with sound and
 * controls in a modal, which is the user's opt-in for audio.
 */
export function ItemHeroVideo({
  url,
  title,
  parallax = true,
  layout = "default",
  logo,
  logoAlt = "",
  logoScale = 1,
  backgroundScale = 1,
  shape = "none",
  overlayStyle = "bottom",
  overlayOpacity = 0.75,
  overlayExtent = 50,
  frame = false,
  brandmark = null,
  brandmarkAlt = "",
}: ItemHeroVideoProps) {
  const t = useTranslations("ItemDetail");
  const tCommon = useTranslations("Common");
  const [fullscreen, setFullscreen] = useState(false);

  // The profile layout needs only a logo: with no shape the bare mark straddles
  // the edge instead of a badge, exactly as in the landing `Hero`. Without a
  // logo there is nothing to hang off the edge, so it falls back to default.
  const hasBadge = shape !== "none";
  const isProfile = layout === "profile" && Boolean(logo);

  // The title is centred over the video (instead of pinned to the bottom edge)
  // in the profile layout - where the bottom row belongs to the disc - and
  // whenever the outline frame is on, since a bottom-pinned frame reads wrong.
  const showCentered = isProfile || frame;

  // Fraction of the disc the logo is drawn at; a value < 1 shrinks the cover
  // render about the disc's centre, leaving a ring of disc background around it.
  const clampedLogoScale = Math.min(Math.max(logoScale, 0.1), 1);

  // The `logo` shape follows the logo's own silhouette (masked plate) instead of
  // a geometric clip; the badge size is shrunk by `backgroundScale`.
  const isLogoShape = shape === "logo";
  const clampedBgScale = Math.min(Math.max(backgroundScale, 0.1), 1);
  const profileSize =
    clampedBgScale === 1
      ? PROFILE_LOGO_SIZE
      : `calc((${PROFILE_LOGO_SIZE}) * ${clampedBgScale})`;

  // The tenant's dark overlay, resolved by the same helper the landing `Hero`
  // uses so the two heroes cannot drift. `undefined` = nothing to draw.
  const overlay = heroOverlayBackground(overlayStyle, overlayOpacity, overlayExtent);

  const expandButton = (
    <IconButton
      icon="/icons/fullscreen.svg"
      aria-label={t("expandVideo")}
      title={t("expandVideo")}
      onClick={() => setFullscreen(true)}
      kind="success"
      translucent
    />
  );

  const video = (
    <Box
      width="100%"
      height="clamp(300px, 35vw, 500px)"
      backgroundColor="#000"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {/* Held paused while the fullscreen modal plays, so the two players don't
          run the same video at once; it resumes when the modal closes. The
          title and its scrim stay outside the drifting layer. */}
      <ParallaxLayer disabled={!parallax}>
        <HeroVideo url={url} playing={!fullscreen} />
      </ParallaxLayer>
      {/* Scrim - keeps the white title legible over an arbitrary video frame. */}
      {overlay && (
        <Box
          aria-hidden
          styles={{
            position: "absolute",
            inset: 0,
            background: overlay,
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}
      {showCentered ? (
        <>
          {/* Centred title. It always starts below the fixed navbar overlaying
              the video's top edge; in the profile layout it stops 24px short of
              the disc straddling the bottom edge, so the title centres in the
              whole band that is left rather than being crammed into its lower
              half - the disc moves the band's floor, not the text's anchor.
              Either way the bottom row is free, so the expand button moves to
              the top-right corner. */}
          <Box
            alignItems="center"
            justifyContent="center"
            paddingX={24}
            styles={{
              position: "absolute",
              top: "var(--ui-navbar-height, 57px)",
              left: 0,
              right: 0,
              bottom: isProfile ? `calc(${profileSize} / 2 + 24px)` : 0,
              zIndex: 10,
            }}
          >
            {frame ? (
              <HeroTextFrame image={brandmark} imageAlt={brandmarkAlt}>
                <Typography
                  as="span"
                  variant="h2"
                  color="#fff"
                  textAlign="center"
                  styles={{
                    lineHeight: 1.25,
                    textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                  }}
                >
                  {title}
                </Typography>
              </HeroTextFrame>
            ) : (
              <Typography
                as="span"
                variant="h2"
                color="#fff"
                textAlign="center"
                styles={{
                  lineHeight: 1.25,
                  textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                }}
              >
                {title}
              </Typography>
            )}
          </Box>
          {/* The bottom row is free (disc or frame owns the centre), so the
              expand button moves to the corner it no longer shares. */}
          <Box
            styles={{
              position: "absolute",
              top: "calc(var(--ui-navbar-height, 57px) + 8px)",
              right: 12,
              zIndex: 11,
            }}
          >
            {expandButton}
          </Box>
        </>
      ) : (
        <Container
          size="lg"
          paddingX={10}
          paddingBottom={8}
          styles={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
          }}
        >
          <Box alignItems="center" justifyContent="space-between" gap={12}>
            <Typography
              as="span"
              variant="h2"
              color="#fff"
              flex="1"
              minWidth={0}
              styles={{
                lineHeight: 1.25,
                textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </Typography>
            {expandButton}
          </Box>
        </Container>
      )}
    </Box>
  );

  return (
    <>
      {isProfile ? (
        // The circle bleeds half its height below the video, so it hangs off
        // this wrapper instead of the `overflow: hidden` box that crops the
        // video. The wrapper's bottom margin reserves the overhang, keeping the
        // page content below the circle rather than behind it.
        <Box
          width="100%"
          marginBottom={`calc(${profileSize} / 2 + 16px)`}
          styles={{ position: "relative" }}
        >
          {video}
          <Box
            width={profileSize}
            height={profileSize}
            // Geometric shapes are opaque white plates (`HERO_BADGE_PLATE`, the
            // same flat white the landing hero's badge and every cradled
            // brandmark take); the `logo` shape draws its plate through a mask
            // instead, and with no shape at all there is no plate - the logo
            // hangs over the edge on its own - so the box stays clear.
            backgroundColor={
              isLogoShape || !hasBadge ? undefined : HERO_BADGE_PLATE
            }
            alignItems="center"
            justifyContent="center"
            styles={{
              position: "absolute",
              left: "50%",
              bottom: `calc(${profileSize} / -2)`,
              transform: "translateX(-50%)",
              overflow: "hidden",
              // drop-shadow, not box-shadow (elevation): the latter is clipped
              // away by the polygon clip-paths and ignores the masked outline.
              filter: HERO_BADGE_SHADOW,
              zIndex: 3,
              ...(isLogoShape || !hasBadge
                ? {}
                : heroLogoBackgroundStyle(shape)),
            }}
          >
            {isLogoShape && logo && (
              // White plate clipped to the logo's own silhouette.
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 0,
                  background: HERO_BADGE_PLATE,
                  ...heroLogoMaskStyle(logo),
                }}
              />
            )}
            {/* A geometric badge fills the disc edge to edge (`cover`) so it
                reads as the logo itself rather than a plate with a stamp on it;
                the `logo` shape instead `contain`s the whole mark so its outline
                matches the masked plate. A smaller scale shrinks either about
                the badge's centre. */}
            <Image
              src={logo ?? ""}
              alt={logoAlt}
              fill
              sizes="200px"
              style={{
                zIndex: 1,
                objectFit: isLogoShape || !hasBadge ? "contain" : "cover",
                transform:
                  clampedLogoScale === 1 || !hasBadge
                    ? undefined
                    : `scale(${clampedLogoScale})`,
              }}
            />
          </Box>
        </Box>
      ) : (
        video
      )}
      {fullscreen && (
        <ConfirmationModal
          title={title}
          text=""
          panelMaxWidth="min(90vw, 1200px)"
          okCallback={() => setFullscreen(false)}
          okLabel={tCommon("ok")}
        >
          {/* Fit the 16:9 frame to the modal instead of letting it overflow into
              a scrollbar. The panel caps itself at `calc(90vh - 50px)`, and the
              title + actions row + padding eat ~150px of that, so the frame's
              height budget is `90vh - 200px`. Capping *height* alone wouldn't
              help (aspect-ratio derives height from width, so the box would just
              overflow) - the width is what's capped here, in explicit vh units
              like movie-detail's TvScrollable, and the ratio follows it down. */}
          <Box
            width="min(100%, calc((90vh - 200px) * 16 / 9))"
            maxHeight="calc(90vh - 200px)"
            marginLeft="auto"
            marginRight="auto"
            backgroundColor="#000"
            borderRadius={8}
            styles={{
              position: "relative",
              aspectRatio: "16 / 9",
              overflow: "hidden",
            }}
          >
            <HeroVideo
              url={url}
              controls
              muted={false}
              loop={false}
              fit="contain"
            />
          </Box>
        </ConfirmationModal>
      )}
    </>
  );
}
