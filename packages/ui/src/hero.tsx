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
 * The shape drawn behind the hero logo (the "logo background" badge). `none`
 * draws the logo with no backing shape. The shape applies in either layout: in
 * `profile` it is the badge straddling the video's bottom edge; in `default` it
 * is a badge centred behind the logo over the video.
 *
 * `logo` is the odd one out: instead of a geometric plate it clips the plate to
 * the logo's *own* silhouette (via a CSS mask on the logo's alpha), so the badge
 * takes the shape of the logo itself. It needs a transparent (alpha) logo - an
 * opaque one masks to its full rectangle, i.e. a plain square.
 */
export type HeroLogoBackground =
  | "none"
  | "circle"
  | "square"
  | "rounded"
  | "triangle"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "logo";

/**
 * Maps a logo-background shape to the CSS that clips a square badge to it.
 * Rounded corners use `border-radius`; the polygons use `clip-path` so any
 * hero-logo consumer (this component and `ItemHeroVideo`) shapes the badge the
 * same way. Exported so those consumers cannot drift apart.
 */
export function heroLogoBackgroundStyle(
  shape: HeroLogoBackground,
): CSSProperties {
  switch (shape) {
    case "circle":
      return { borderRadius: "50%" };
    case "rounded":
      return { borderRadius: 8 };
    case "triangle":
      return { clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" };
    case "pentagon":
      return {
        clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
      };
    case "hexagon":
      return {
        clipPath:
          "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
      };
    case "octagon":
      return {
        clipPath:
          "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
      };
    // "square", "none" and "logo" need no clip-path/border-radius here: "square"
    // and "none" are the bare box, and "logo" is shaped by a CSS mask instead
    // (see heroLogoMaskStyle), not by clipping the box.
    default:
      return {};
  }
}

/**
 * Elevation for the logo badge, expressed as a `filter` rather than a
 * `box-shadow`. A `box-shadow` is clipped away by `clip-path` (the polygon
 * shapes) and traces the box rather than a masked outline (the `logo` shape), so
 * those badges rendered flat. `drop-shadow` instead traces the element's
 * *rendered* alpha, so every shape - disc, polygon, or the logo's own silhouette
 * - gets a matching shadow. Values mirror `elevation={5}` (spread is 0 there,
 * which `drop-shadow` could not express anyway). Exported so `ItemHeroVideo`
 * shadows its badge identically.
 */
export const HERO_BADGE_SHADOW =
  "drop-shadow(0 3px 5px rgba(0,0,0,0.21)) drop-shadow(0 4px 11px rgba(0,0,0,0.105))";

/**
 * Same-origin URL for a (possibly cross-origin) logo, safe to use as a CSS
 * `mask-image`. A cross-origin mask image that is not served CORS-clean resolves
 * to an *empty* mask in Chromium/WebKit - the masked element is then clipped away
 * entirely. That is why the `logo`-shape plate shows in development (media served
 * same-origin from localhost) but vanishes in production (media served from a
 * separate API/CDN origin, leaving only the logo drawn on top). Routing an
 * absolute http(s) raster URL through Next's same-origin image optimizer removes
 * the cross-origin barrier; an SVG (which the optimizer refuses without
 * `dangerouslyAllowSVG`), a `data:` URI, or a relative/same-origin path is left
 * untouched. Shared so both hero consumers resolve the mask the same way.
 */
export function heroLogoMaskUrl(logoUrl: string): string {
  const isRemote = /^https?:\/\//i.test(logoUrl);
  const isSvg = /\.svg(?:[?#]|$)/i.test(logoUrl);
  return isRemote && !isSvg
    ? `/_next/image?url=${encodeURIComponent(logoUrl)}&w=384&q=75`
    : logoUrl;
}

/**
 * Style for the `logo`-shape badge's backing plate: a solid fill clipped to the
 * logo's own alpha via a CSS mask, so the badge reads as a page-coloured hole in
 * the shape of the logo (the raster analogue of the geometric plates). `contain`
 * so the whole mark is used and lines up with the logo drawn on top. Needs a
 * transparent (alpha) logo. Shared so both hero consumers cut the plate the same.
 */
export function heroLogoMaskStyle(logoUrl: string): CSSProperties {
  const src = heroLogoMaskUrl(logoUrl);
  return {
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
}

/**
 * Diameter of the `profile` logo circle. Grows with the viewport, because at
 * phone widths a fixed 200px disc would eat most of the hero.
 */
export const HERO_PROFILE_LOGO_SIZE = "clamp(145px, 20vw, 250px)";

/**
 * Diameter of the logo badge in the `default` layout. Smaller than the `profile`
 * disc because here the badge shares the frame with the slogan/subline/CTA
 * stacked below it: at the profile disc's size that stack would push the badge up
 * under the fixed navbar (the very bug the content overlay's top inset fixes).
 */
const DEFAULT_LOGO_SIZE = "clamp(96px, 13vw, 160px)";

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
  /**
   * A quieter supporting line under the slogan - smaller, lighter and less
   * letter-spaced, so the two lines read as a headline and a subtitle instead
   * of two equal-weight sentences. Omit for a single-line hero. @default null
   */
  subline?: string | null;
  /**
   * Horizontal alignment of the slogan block. `start` also caps its measure, so
   * a left-aligned headline breaks into a tight stack of short lines rather
   * than running the full width of the container. The logo (in the `default`
   * layout) stays centred either way. @default "center"
   */
  align?: "center" | "start";
  /**
   * A call-to-action row rendered under the hero text - the caller's own
   * `Button`/`LinkButton` primitives, so this component stays free of routing
   * and translation concerns. Follows `align`. @default undefined
   */
  actions?: React.ReactNode;
  /**
   * Opacity (0-1) of a flat black scrim over the whole hero, under the content.
   * The built-in gradient only darkens the bottom ~45%, so text sitting higher
   * up has to rely on its own text-shadow; a scrim darkens the whole frame
   * instead and lets the type carry itself. `0` renders no scrim at all.
   * @default 0
   */
  scrim?: number;
  /** Drift the background against the page as it scrolls. Pass false for a static background. */
  parallax?: boolean;
  /** How the logo and slogan are composed over the background. @default "default" */
  layout?: HeroLayout;
  /**
   * Shape of the badge drawn behind the logo. `none` draws the logo plain. In
   * the `profile` layout the badge straddles the video's bottom edge; in
   * `default` it sits centred behind the logo over the video. @default "none"
   */
  logoBackground?: HeroLogoBackground;
  /**
   * The drawn size of the logo inside the badge, as a
   * fraction of the disc. `1` is the current edge-to-edge `cover` fill; a smaller
   * value (e.g. `0.5`) shrinks the logo about the disc's centre, leaving a ring of
   * the disc's page-background colour around it. Clamped to `[0.1, 1]`. @default 1
   */
  profileLogoScale?: number;
  /**
   * The drawn size of the badge itself, as a fraction of its default diameter.
   * `1` is the full size; a smaller value (e.g. `0.7`) shrinks the whole badge -
   * shape, logo and all - about its centre, without changing how much of the
   * badge the logo fills (that is `profileLogoScale`). Clamped to `[0.1, 1]`.
   * @default 1
   */
  profileBackgroundScale?: number;
  /**
   * Multiplier applied to the logo, slogan and profile-circle sizes only (not
   * the hero box itself). `1` is the real site; a smaller value (e.g. `0.5`)
   * shrinks the overlaid content so a constrained preview reads as look-and-feel
   * rather than at real, viewport-derived sizes. @default 1
   */
  contentScale?: number;
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
  subline,
  actions,
  align = "center",
  scrim = 0,
  parallax = true,
  layout = "default",
  logoBackground = "none",
  contentScale = 1,
  profileLogoScale = 1,
  profileBackgroundScale = 1,
  style,
  className,
}: HeroProps) {
  const hasVideo = Boolean(videoUrl);
  const hasBackground = hasVideo || Boolean(backgroundImage);

  if (!hasBackground && !logoImage) return null;

  // A badge is only drawn when a shape is chosen AND there is a logo to put in
  // it. In the profile layout it is what straddles the bottom edge; with no
  // badge there is nothing to straddle with, so profile falls back to default.
  const hasBadge = logoBackground !== "none" && Boolean(logoImage);
  const isProfile = layout === "profile" && hasBadge;
  const isStart = align === "start";

  // At scale 1 keep the exact CSS strings the live site uses; only wrap them in
  // a `calc(… * scale)` when a preview actually asks for a smaller content size.
  const scaled = (size: string) =>
    contentScale === 1 ? size : `calc((${size}) * ${contentScale})`;

  // The badge diameter, shrunk by `profileBackgroundScale` before the preview's
  // `contentScale` is applied, so the two multipliers compose cleanly.
  const badgeScale = Math.min(Math.max(profileBackgroundScale, 0.1), 1);
  const profileLogoSize = scaled(
    badgeScale === 1
      ? HERO_PROFILE_LOGO_SIZE
      : `calc((${HERO_PROFILE_LOGO_SIZE}) * ${badgeScale})`,
  );

  // The drawn badge diameter. In `profile` the badge *is* the straddling disc, so
  // it keeps `profileLogoSize` (which the wrapper margin and disc offsets are
  // built on). In `default` it sits above the text stack and must clear the
  // navbar, so it draws at the smaller `DEFAULT_LOGO_SIZE`.
  const badgeBaseSize = isProfile ? HERO_PROFILE_LOGO_SIZE : DEFAULT_LOGO_SIZE;
  const badgeSize = scaled(
    badgeScale === 1
      ? badgeBaseSize
      : `calc((${badgeBaseSize}) * ${badgeScale})`,
  );

  // Fraction of the badge the logo is drawn at. Scaling the `cover` image down
  // about its centre keeps the exact 100% look and reveals a ring of the badge's
  // own background around a shrunk logo.
  const logoScale = Math.min(Math.max(profileLogoScale, 0.1), 1);

  // The logo-background badge: a square box clipped to the chosen shape, filled
  // with the page's own background so it reads as a hole punched through the
  // video onto the page. Positioned by its caller (centred in the content stack
  // for `default`, straddling the bottom edge for `profile`).
  const isLogoShape = logoBackground === "logo";
  const badge = hasBadge ? (
    <Box
      width={badgeSize}
      height={badgeSize}
      // Geometric shapes are opaque page-background plates; the `logo` shape
      // draws its plate through a mask (below) instead, so the box stays clear.
      backgroundColor={
        isLogoShape ? undefined : "var(--page-background, var(--background))"
      }
      alignItems="center"
      justifyContent="center"
      styles={{
        position: "relative",
        overflow: "hidden",
        // drop-shadow, not box-shadow (elevation): the latter is clipped away by
        // the polygon clip-paths and ignores the masked `logo` outline.
        filter: HERO_BADGE_SHADOW,
        ...(isLogoShape ? {} : heroLogoBackgroundStyle(logoBackground)),
      }}
    >
      {isLogoShape && logoImage && (
        // The page-background plate, clipped to the logo's own silhouette so the
        // badge reads as a logo-shaped hole through the video onto the page.
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            background: "var(--page-background, var(--background))",
            ...heroLogoMaskStyle(logoImage),
          }}
        />
      )}
      {/* A geometric badge fills edge to edge (`cover`) so it reads as the logo
          itself rather than a plate with a stamp on it; the `logo` shape instead
          `contain`s the whole mark so its outline matches the masked plate. A
          smaller `logoScale` shrinks either about the badge's centre. */}
      <img
        src={logoImage ?? ""}
        alt={logoAlt}
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          objectFit: isLogoShape ? "contain" : "cover",
          transform: logoScale === 1 ? undefined : `scale(${logoScale})`,
        }}
      />
    </Box>
  ) : null;

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

      {/* ── Flat scrim (whole frame, opt-in) ─────────────────── */}
      {/* Sits under the gradient so the two compose: the scrim evens out a busy
          background everywhere, the gradient still anchors the bottom edge. */}
      {scrim > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `rgba(0,0,0,${Math.min(Math.max(scrim, 0), 1)})`,
            zIndex: 1,
          }}
        />
      )}

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
          centred in the *lower* half of that space (`top: 50%`), sitting it just
          above the circle (with a 24px gap) rather than adrift in the middle of
          the video. In the default layout the stack is inset from the top by the
          navbar height so the centred logo+text never tucks under the fixed
          navbar overlaying the hero's top edge. */}
      {(logoImage || slogan || subline || actions) && (
        <div
          style={{
            position: "absolute",
            top: isProfile ? "50%" : "var(--ui-navbar-height, 57px)",
            left: 0,
            right: 0,
            bottom: isProfile ? `calc(${profileLogoSize} / 2 + 24px)` : 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: scaled("1rem"),
            zIndex: 2,
          }}
        >
          {/* Not the profile layout (its logo has left for the bottom-edge
              badge): draw the centred badge if a shape is set, else the plain
              logo over the video. */}
          {logoImage &&
            !isProfile &&
            (hasBadge ? (
              badge
            ) : (
              <img
                src={logoImage}
                alt={logoAlt}
                style={{
                  maxWidth: scaled("min(320px, 50%)"),
                  maxHeight: scaled("45%"),
                  objectFit: "contain",
                }}
              />
            ))}
          {(slogan || subline || actions) && (
            <Container size="lg" paddingX={16}>
              {slogan && (
                <p
                  style={{
                    margin: 0,
                    color: "#fff",
                    textAlign: isStart ? "left" : "center",
                    // Left-aligned type needs a measure, or the headline runs
                    // the container's full width and stops reading as a stack.
                    maxWidth: isStart ? "20ch" : undefined,
                    fontFamily: "var(--font-display, inherit)",
                    fontSize: scaled("clamp(1.25rem, 3vw, 2rem)"),
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    // A scrim already carries the contrast, so the shadow -
                    // which is what makes un-scrimmed hero type look pasted on -
                    // is only drawn when there is no scrim to rely on.
                    textShadow:
                      scrim > 0 ? undefined : "0 2px 8px rgba(0,0,0,0.7)",
                    // Honour the newlines the tenant typed in the multirow slogan
                    // field: render each line on its own line, but still wrap long
                    // lines. Consecutive spaces stay collapsed (pre-line, not pre-wrap).
                    whiteSpace: "pre-line",
                  }}
                >
                  {slogan}
                </p>
              )}
              {subline && (
                <p
                  style={{
                    margin: slogan ? `${scaled("0.75rem")} 0 0` : 0,
                    color: "rgba(255,255,255,0.86)",
                    textAlign: isStart ? "left" : "center",
                    maxWidth: isStart ? "42ch" : undefined,
                    marginLeft: isStart ? undefined : "auto",
                    marginRight: isStart ? undefined : "auto",
                    fontSize: scaled("clamp(0.9375rem, 1.4vw, 1.125rem)"),
                    fontWeight: 400,
                    lineHeight: 1.55,
                    textShadow:
                      scrim > 0 ? undefined : "0 1px 6px rgba(0,0,0,0.7)",
                    whiteSpace: "pre-line",
                  }}
                >
                  {subline}
                </p>
              )}
              {actions && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    marginTop: scaled("1.5rem"),
                    justifyContent: isStart ? "flex-start" : "center",
                  }}
                >
                  {actions}
                </div>
              )}
            </Container>
          )}
        </div>
      )}
    </div>
  );

  if (!isProfile) return hero;

  // The badge bleeds half its height below the hero, so it cannot live inside
  // the `overflow: hidden` box that crops the video. It hangs off this wrapper
  // instead, which reserves the overhang as bottom margin so the page content
  // underneath starts below the badge rather than behind it.
  return (
    <Box
      width="100%"
      marginBottom={`calc(${profileLogoSize} / 2 + 16px)`}
      styles={{ position: "relative" }}
    >
      {hero}
      <Box
        styles={{
          position: "absolute",
          left: "50%",
          bottom: `calc(${profileLogoSize} / -2)`,
          transform: "translateX(-50%)",
          zIndex: 3,
        }}
      >
        {badge}
      </Box>
    </Box>
  );
}

export default Hero;
