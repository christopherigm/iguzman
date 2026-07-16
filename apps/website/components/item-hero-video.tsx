"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { HeroVideo } from "@repo/ui/hero-video";
import { ParallaxLayer } from "@repo/ui/parallax-layer";

interface ItemHeroVideoProps {
  /** YouTube, Vimeo or direct video URL. */
  url: string;
  /** Item name - used as the fullscreen dialog's heading. */
  title: string;
  /** Drift the video against the page as it scrolls, matching the landing `Hero`. */
  parallax?: boolean;
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
}: ItemHeroVideoProps) {
  const t = useTranslations("ItemDetail");
  const tCommon = useTranslations("Common");
  const [fullscreen, setFullscreen] = useState(false);

  return (
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
          <IconButton
            icon="/icons/fullscreen.svg"
            aria-label={t("expandVideo")}
            title={t("expandVideo")}
            onClick={() => setFullscreen(true)}
            kind="success"
            translucent
          />
        </Box>
      </Container>
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
    </Box>
  );
}
