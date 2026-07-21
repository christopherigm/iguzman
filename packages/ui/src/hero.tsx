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
 * - `none` - the logo is dropped entirely; only the text (slogan/subline) and
 *   any `actions` are centred over the video. For a tenant whose video already
 *   carries the branding, or who wants a text-only hero.
 * - `profile` - the logo sits in a circle straddling the hero's bottom edge
 *   (half in, half out) the way a profile picture sits on a cover photo, with
 *   the text centred in the space left above it. With no logo background the
 *   bare logo straddles the edge instead of a badge.
 */
export type HeroLayout = "default" | "none" | "profile";

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
 * Shape of the dark overlay drawn between the hero background and its content -
 * what keeps white type legible over an arbitrary video frame.
 *
 * - `none` - no overlay; the background shows through untouched.
 * - `full` - a flat tint over the whole frame.
 * - `bottom` - the historical default: dark at the bottom edge, clear by mid-frame.
 * - `top` - its mirror, for text composed against the top edge.
 * - `both` - dark at both edges, clear through the middle.
 * - `vignette` - clear in the centre, darkening towards the corners.
 */
export type HeroOverlayStyle =
  | "none"
  | "full"
  | "bottom"
  | "top"
  | "both"
  | "vignette";

/**
 * Neutral value for `heroOverlayBackground`'s `extent`: the point on the 0-100
 * scale that reproduces the gradients this component used to hard-code. Each
 * style keeps its own historical fade stop as the value at this extent, so a
 * hero that says nothing about extent (or a stored row that predates the field)
 * looks exactly as it always did.
 */
export const DEFAULT_HERO_OVERLAY_EXTENT = 50;

/**
 * CSS `background` for the hero's dark overlay, or `undefined` when the chosen
 * style/opacity draws nothing. `opacity` is the 0-1 strength of the *darkest*
 * part of the overlay - the gradient styles fade from it to transparent.
 *
 * `extent` (0-100) scales *how far* the darkening reaches across the frame - a
 * taller/shorter dark band - independently of `opacity` (how dark it gets).
 * `DEFAULT_HERO_OVERLAY_EXTENT` (50) is the neutral point that reproduces the
 * old hard-coded stops; larger reaches further, smaller pulls it back to the
 * edge. `full` is a flat tint, so `extent` does nothing to it.
 *
 * Exported so every hero consumer (this component and the website's
 * `ItemHeroVideo`) resolves the tenant's setting to the same pixels; a second
 * hand-written gradient is how the landing hero and the item hero drift apart.
 */
export function heroOverlayBackground(
  style: HeroOverlayStyle,
  opacity: number,
  extent: number = DEFAULT_HERO_OVERLAY_EXTENT,
): string | undefined {
  const a = Math.min(Math.max(opacity, 0), 1);
  if (style === "none" || a === 0) return undefined;
  const dark = `rgba(0,0,0,${a})`;
  const clear = "rgba(0,0,0,0)";
  // `reach` is 1 at the neutral extent, so multiplying a style's historical stop
  // by it leaves that stop unchanged at 50 and scales it linearly either side.
  const reach = Math.min(Math.max(extent, 0), 100) / DEFAULT_HERO_OVERLAY_EXTENT;
  const pct = (n: number) => Math.round(Math.min(Math.max(n, 0), 100));
  switch (style) {
    case "full":
      return dark;
    case "top":
      return `linear-gradient(to bottom, ${dark} 0%, ${clear} ${pct(55 * reach)}%)`;
    case "both": {
      // Cap each side below the mid-line so the two clear stops stay ordered
      // (a stop past 50% would cross its mirror and invert the gradient).
      const stop = Math.min(pct(35 * reach), 49);
      return `linear-gradient(to bottom, ${dark} 0%, ${clear} ${stop}%, ${clear} ${100 - stop}%, ${dark} 100%)`;
    }
    case "vignette":
      // Reach grows the *dark* ring, which shrinks the clear centre from its
      // historical 40% radius (dark ring = 60% at the neutral extent).
      return `radial-gradient(ellipse at center, ${clear} ${pct(100 - 60 * reach)}%, ${dark} 100%)`;
    default:
      return `linear-gradient(to top, ${dark} 0%, ${clear} ${pct(55 * reach)}%)`;
  }
}

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

/**
 * Diameter of the brandmark circle that straddles the top of a hero text frame.
 * Grows a little with the viewport, like the profile disc, so it does not look
 * tiny on a wide hero nor overwhelm a phone-width one.
 */
const HERO_FRAME_BADGE_SIZE = "clamp(36px, 4.55vw, 50px)";

/**
 * Wraps a hero's section/page heading in a thin outline frame. When `image` is
 * given (the tenant's brandmark) it sits in a white circle cradled at the top:
 * the top border breaks in the centre and rises on either side into two curved
 * shoulders that meet the circle's lower flanks, leaving the circle mostly above
 * the line (the way a bean caps a café plate). With no image the frame is just
 * the outline. Exported and shared so every hero
 * consumer (this component and the website's `ItemHeroVideo`) frames its text
 * identically, the way `heroOverlayBackground`/the badge helpers keep the two
 * heroes from drifting.
 *
 * `scale` multiplies the badge and padding for a constrained preview, matching
 * the `Hero`'s `contentScale`.
 */
export function HeroTextFrame({
  children,
  image,
  imageAlt = "",
  scale = 1,
}: {
  children: React.ReactNode;
  /** Brandmark shown in the top-centre circle; omit for a bare outline. */
  image?: string | null;
  imageAlt?: string;
  /** Preview multiplier for the badge + padding. @default 1 */
  scale?: number;
}) {
  const sized = (v: string) => (scale === 1 ? v : `calc((${v}) * ${scale})`);
  const badge = sized(HERO_FRAME_BADGE_SIZE);
  const border = "rgba(255,255,255,0.9)";

  // Bare outline (no brandmark): the original full-border frame, unchanged.
  if (!image) {
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <div
          style={{
            border: `2px solid ${border}`,
            padding: sized("0.8em 1.7em"),
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // Cradled brandmark: the top border is drawn as two straight flanks with a
  // centred gap, bridged by an SVG that rises into two shoulders meeting the
  // circle's lower flanks. The circle itself sits mostly above the frame.
  // Widths derive from the (responsive) badge diameter so the cradle scales
  // with it; the SVG keeps a fixed 210×60 viewBox (same 3.5 ratio as its box,
  // so `preserveAspectRatio: none` doesn't distort it) and a non-scaling 2px
  // stroke so the shoulders stay the same weight as the 2px flanks/side borders.
  const cradleW = `calc((${badge}) * 2.1)`;
  const cradleH = `calc((${badge}) * 0.6)`;
  // Each flank runs from the outer corner (2px outside the padding box, over the
  // side border) to the edge of the centred cradle gap.
  const flankW = `calc(50% - (${cradleW}) / 2 + 2px)`;
  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        // Reserve the space the circle + shoulders occupy above the frame, so
        // an ancestor never clips them.
        marginTop: `calc((${badge}) * 0.85 + 8px)`,
      }}
    >
      <div
        style={{
          position: "relative",
          borderLeft: `2px solid ${border}`,
          borderRight: `2px solid ${border}`,
          borderBottom: `2px solid ${border}`,
          borderTop: "none",
          padding: sized("0.8em 1.7em"),
        }}
      >
        {/* Straight top-border flanks, gapped in the centre for the cradle.
            They start 2px outside the padding box (`left/right: -2`) so they run
            fully over the side borders and close the top corners. */}
        <div
          style={{
            position: "absolute",
            top: -1,
            left: -2,
            width: flankW,
            height: 2,
            background: border,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -1,
            right: -2,
            width: flankW,
            height: 2,
            background: border,
          }}
        />
        {/* The two rising shoulders that cradle the circle. Each is a convex
            arc (bulging up) that rises off the flank and eases into the circle's
            lower flank; its viewBox coords in the 210×60 box correspond to a
            circle centred at (105, 25) with radius 50 (the badge), and the arc
            ends a few units *inside* that circle so its tip tucks under the
            badge (drawn on top), guaranteeing a seamless join. */}
        <svg
          viewBox="0 0 210 60"
          preserveAspectRatio="none"
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: `calc(-1 * (${cradleH}))`,
            transform: "translateX(-50%)",
            width: cradleW,
            height: cradleH,
            overflow: "visible",
          }}
        >
          <path
            d="M0,60 Q26,36 66,30"
            fill="none"
            stroke={border}
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M210,60 Q184,36 144,30"
            fill="none"
            stroke={border}
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* The brandmark circle, sitting in the cradle above the frame. */}
        <div
          style={{
            position: "absolute",
            top: `calc((${badge}) * -0.85)`,
            left: "50%",
            transform: "translateX(-50%)",
            width: badge,
            height: badge,
            borderRadius: "50%",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            zIndex: 1,
          }}
        >
          <img
            src={image}
            alt={imageAlt}
            style={{ width: "72%", height: "72%", objectFit: "contain" }}
          />
        </div>
        {children}
      </div>
    </div>
  );
}

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
  /**
   * Shape of the dark overlay between the background and the content. The
   * default reproduces the historical hard-coded gradient, so a hero that says
   * nothing about the overlay looks exactly as it always did. @default "bottom"
   */
  overlayStyle?: HeroOverlayStyle;
  /**
   * Strength (0-1) of the darkest part of `overlayStyle`. `0` removes the
   * overlay whatever the style. @default 0.75
   */
  overlayOpacity?: number;
  /**
   * How far the gradient overlay reaches across the frame (0-100), independent
   * of `overlayOpacity`. `DEFAULT_HERO_OVERLAY_EXTENT` (50) reproduces the
   * historical stops; a flat `full` overlay ignores it. @default 50
   */
  overlayExtent?: number;
  /** Drift the background against the page as it scrolls. Pass false for a static background. */
  parallax?: boolean;
  /**
   * Wrap the slogan/subline in an outline frame (see `HeroTextFrame`). Used for
   * section/page headings over a hero - not the landing hero. @default false
   */
  frame?: boolean;
  /**
   * Brandmark shown in the circle straddling the top of the text frame. Only
   * meaningful with `frame`; omit for a bare outline. @default null
   */
  frameImage?: string | null;
  /** Alt text for the frame's brandmark image. */
  frameImageAlt?: string;
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
  overlayStyle = "bottom",
  overlayOpacity = 0.75,
  overlayExtent = DEFAULT_HERO_OVERLAY_EXTENT,
  parallax = true,
  frame = false,
  frameImage = null,
  frameImageAlt = "",
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
  // it. The profile layout needs only the logo, though: with no shape the bare
  // mark is what straddles the bottom edge, so "none" changes the backing plate
  // and not the layout. With no logo at all there is nothing to hang off the
  // edge, so profile falls back to default.
  // The `none` layout drops the logo entirely (badge or bare mark), leaving only
  // the text and any actions over the video. It also rules out the profile
  // treatment, which is a logo layout.
  const hideLogo = layout === "none";
  const hasBadge =
    !hideLogo && logoBackground !== "none" && Boolean(logoImage);
  const isProfile = layout === "profile" && Boolean(logoImage);
  const isStart = align === "start";

  // The tenant-configured overlay, and whether the type can stop carrying its
  // own shadow: only an overlay that darkens the whole frame (a flat tint, or a
  // scrim) does that - a gradient leaves the far edge as bright as the video.
  const overlay = heroOverlayBackground(overlayStyle, overlayOpacity, overlayExtent);
  const litFromBelow =
    scrim > 0 || (overlayStyle === "full" && Boolean(overlay));

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

  // What straddles the hero's bottom edge in the `profile` layout: the badge
  // when a shape is chosen, otherwise the logo itself, drawn `contain` in a box
  // of the same diameter so it keeps its own silhouette with nothing behind it.
  const profileMark =
    hasBadge || !logoImage ? (
      badge
    ) : (
      <img
        src={logoImage}
        alt={logoAlt}
        style={{
          display: "block",
          width: profileLogoSize,
          height: profileLogoSize,
          objectFit: "contain",
          // drop-shadow, not elevation: it traces the mark, not its bounding box.
          filter: HERO_BADGE_SHADOW,
        }}
      />
    );

  // The slogan/subline/actions stack, shared between the framed and unframed
  // renders below so the frame is a pure wrapper and neither copy can drift.
  const textContent = (
    <>
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
            // An overlay that covers the whole frame already carries
            // the contrast, so the shadow - which is what makes
            // un-scrimmed hero type look pasted on - is only drawn when
            // there is nothing behind the type to rely on.
            textShadow: litFromBelow ? undefined : "0 2px 8px rgba(0,0,0,0.7)",
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
            textShadow: litFromBelow ? undefined : "0 1px 6px rgba(0,0,0,0.7)",
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
    </>
  );

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

      {/* ── Dark overlay (shape + strength are the tenant's) ─── */}
      {overlay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: overlay,
            zIndex: 1,
          }}
        />
      )}

      {/* ── Centred logo + slogan ─────────────────────────────── */}
      {/* In the profile layout the logo has left this stack for the circle
          below, so the slogan alone is centred in the space above it. It is
          centred in the *lower* half of that space (`top: 50%`), sitting it just
          above the circle (with a 24px gap) rather than adrift in the middle of
          the video. In the default layout the stack is inset from the top by the
          navbar height so the centred logo+text never tucks under the fixed
          navbar overlaying the hero's top edge. */}
      {((logoImage && !hideLogo) || slogan || subline || actions) && (
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
            !hideLogo &&
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
              {frame ? (
                // inline-block frame, centred (or left-aligned) via the parent's
                // text-align - so the outline hugs the heading rather than the
                // whole container width.
                <div style={{ textAlign: isStart ? "left" : "center" }}>
                  <HeroTextFrame
                    image={frameImage}
                    imageAlt={frameImageAlt}
                    scale={contentScale}
                  >
                    {textContent}
                  </HeroTextFrame>
                </div>
              ) : (
                textContent
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
        {profileMark}
      </Box>
    </Box>
  );
}

export default Hero;
