import React, { CSSProperties } from "react";
import { HeroVideo } from "./hero-video";
import { ParallaxLayer } from "./parallax-layer";
import { Box } from "./core-elements/box";
import { Container } from "./core-elements/container";
import "./hero.css";

/**
 * How the logo and the text are composed over a hero video.
 *
 * - `default` - both centred over the video, logo above the text.
 * - `profile` - the logo sits in a circle straddling the hero's bottom edge
 *   (half in, half out) the way a profile picture sits on a cover photo, with
 *   the text centred in the space left above it.
 */
export type HeroLayout = "default" | "profile";

/**
 * Diameter of the `profile` logo circle. Grows with the viewport, because at
 * phone widths a fixed 200px disc would eat most of the hero.
 */
export const HERO_PROFILE_LOGO_SIZE = "clamp(145px, 20vw, 250px)";

export type HeroProps = {
  /** YouTube, Vimeo, or direct video file URL. Takes priority over backgroundImage. */
  videoUrl?: string | null;
  /** Fallback background image URL shown when no video is provided. */
  backgroundImage?: string | null;
  /** Image rendered centred over the hero (e.g. a logo). */
  logoImage?: string | null;
  /** Alt text for the logo image. */
  logoAlt?: string;
  /** Alt text for the background image. */
  backgroundAlt?: string;
  /** Slogan text rendered centred below the logo (or centred alone if no logo). */
  slogan?: string | null;
  /** Drift the background against the page as it scrolls. Pass false for a static background. */
  parallax?: boolean;
  /** How the logo and slogan are composed over the background. @default "default" */
  layout?: HeroLayout;
  /** Additional styles applied to the outermost container. */
  style?: CSSProperties;
  className?: string;
};

/**
 * Hero - full-width hero section with a background video or image, a
 * bottom-to-mid gradient overlay, and a centred logo.
 *
 * This component is a server component. The video playback is delegated to
 * `HeroVideo` ('use client') and the scroll drift to `ParallaxLayer`
 * ('use client'), so only those subtrees are hydrated on the client.
 *
 * The background drifts with the page by default (`parallax`); the logo and
 * slogan sit outside that layer and scroll with the hero box, which is what
 * separates the two planes.
 *
 * Priority: videoUrl → backgroundImage
 *
 * @example
 * <Hero
 *   videoUrl={system.video_link}
 *   backgroundImage={system.img_hero}
 *   logoImage={system.img_logo_hero}
 *   logoAlt={system.site_name}
 * />
 */
export function Hero({
  videoUrl,
  backgroundImage,
  logoImage,
  logoAlt = "",
  backgroundAlt = "",
  slogan,
  parallax = true,
  layout = "default",
  style,
  className,
}: HeroProps) {
  const hasVideo = Boolean(videoUrl);
  const hasBackground = hasVideo || Boolean(backgroundImage);

  if (!hasBackground && !logoImage) return null;

  // The circle is the whole point of the profile layout - with no logo to put
  // in it there is nothing to straddle the edge with, so fall back to default.
  const isProfile = layout === "profile" && Boolean(logoImage);

  const hero = (
    <div
      className={[!hasVideo ? "hero--image" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        position: "relative",
        width: "100%",
        height: hasVideo
          ? "clamp(350px, 45vw, 600px)"
          : "clamp(500px, 65vw, 800px)",
        overflow: "hidden",
        backgroundColor: "#000",
        ...style,
      }}
    >
      {/* ── Background layer ─────────────────────────────────── */}
      <ParallaxLayer disabled={!parallax}>
        {hasVideo && videoUrl && <HeroVideo url={videoUrl} />}

        {!hasVideo && backgroundImage && (
          <img
            src={backgroundImage}
            alt={backgroundAlt}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
      </ParallaxLayer>

      {/* ── Gradient overlay (bottom → mid) ──────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 55%)",
          zIndex: 1,
        }}
      />

      {/* ── Centred logo + slogan ─────────────────────────────── */}
      {/* In the profile layout the logo has left this stack for the circle
          below, so the slogan alone is centred in the space above it. It is
          centred in the *lower* half of that space (`top: 50%`), which sits it
          just above the circle rather than adrift in the middle of the video. */}
      {(logoImage || slogan) && (
        <div
          style={{
            position: "absolute",
            top: isProfile ? "50%" : 0,
            left: 0,
            right: 0,
            bottom: isProfile ? `calc(${HERO_PROFILE_LOGO_SIZE} / 2)` : 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            zIndex: 2,
          }}
        >
          {logoImage && !isProfile && (
            <>
              <img
                src={logoImage}
                alt={logoAlt}
                style={{
                  maxWidth: "min(320px, 50%)",
                  maxHeight: "45%",
                  objectFit: "contain",
                }}
              />
            </>
          )}
          {slogan && (
            <Container size="md" paddingX={16}>
              <p
                style={{
                  margin: 0,
                  color: "#fff",
                  textAlign: "center",
                  fontSize: "clamp(1.25rem, 3vw, 2rem)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                }}
              >
                {slogan}
              </p>
            </Container>
          )}
        </div>
      )}
    </div>
  );

  if (!isProfile) return hero;

  // The circle bleeds half its height below the hero, so it cannot live inside
  // the `overflow: hidden` box that crops the video. It hangs off this wrapper
  // instead, which reserves the overhang as bottom margin so the page content
  // underneath starts below the circle rather than behind it.
  return (
    <Box
      width="100%"
      marginBottom={`calc(${HERO_PROFILE_LOGO_SIZE} / 2 + 16px)`}
      styles={{ position: "relative" }}
    >
      {hero}
      <Box
        width={HERO_PROFILE_LOGO_SIZE}
        height={HERO_PROFILE_LOGO_SIZE}
        borderRadius="50%"
        // The page's own background, resolved per theme by the app, so the disc
        // reads as a hole punched through the video into the page beneath it.
        backgroundColor="var(--page-background, var(--background))"
        elevation={5}
        alignItems="center"
        justifyContent="center"
        styles={{
          position: "absolute",
          left: "50%",
          bottom: `calc(${HERO_PROFILE_LOGO_SIZE} / -2)`,
          transform: "translateX(-50%)",
          overflow: "hidden",
          zIndex: 3,
        }}
      >
        {/* Fills the disc edge to edge (`cover`), so the circle reads as the
            logo itself rather than as a plate with a stamp on it. */}
        <img
          src={logoImage ?? ""}
          alt={logoAlt}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </Box>
    </Box>
  );
}

export default Hero;
