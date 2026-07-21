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
import type { HeroLayout } from "@repo/ui/hero";

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
  /** Logo shown in the circle of the `profile` layout (`System.img_logo_hero`). */
  logo?: string | null;
  /** Alt text for the logo - the site name. */
  logoAlt?: string;
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
}: ItemHeroVideoProps) {
  const t = useTranslations("ItemDetail");
  const tCommon = useTranslations("Common");
  const [fullscreen, setFullscreen] = useState(false);

  // Without a logo there is no circle to straddle the edge with, so the profile
  // layout has nothing to render and falls back to the default one.
  const isProfile = layout === "profile" && Boolean(logo);

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
      <Box
        aria-hidden
        height="45%"
        styles={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      {isProfile ? (
        <>
          {/* Centred in what the circle leaves, biased low: the box spans the
              lower half of the video and stops half a circle short of the
              bottom edge, so the title sits just above the disc rather than
              adrift in the middle of the frame. */}
          <Box
            alignItems="center"
            justifyContent="center"
            paddingX={24}
            styles={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              bottom: `calc(${PROFILE_LOGO_SIZE} / 2)`,
              zIndex: 10,
            }}
          >
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
          </Box>
          {/* The bottom row is the circle's now, so the expand button moves to
              the corner it no longer shares. */}
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
          marginBottom={`calc(${PROFILE_LOGO_SIZE} / 2 + 16px)`}
          styles={{ position: "relative" }}
        >
          {video}
          <Box
            width={PROFILE_LOGO_SIZE}
            height={PROFILE_LOGO_SIZE}
            borderRadius="50%"
            // The page's own background (resolved per theme in globals.css), so
            // the disc reads as a hole through the video onto the page.
            backgroundColor="var(--page-background, var(--background))"
            elevation={5}
            alignItems="center"
            justifyContent="center"
            styles={{
              position: "absolute",
              left: "50%",
              bottom: `calc(${PROFILE_LOGO_SIZE} / -2)`,
              transform: "translateX(-50%)",
              overflow: "hidden",
              zIndex: 3,
            }}
          >
            {/* Fills the disc edge to edge (`cover`), so the circle reads as
                the logo itself rather than as a plate with a stamp on it. */}
            <Image
              src={logo ?? ""}
              alt={logoAlt}
              fill
              sizes="200px"
              style={{ objectFit: "cover" }}
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
