import "./logo-watermark.css";

/**
 * Area the rotated pattern layer has to cover, in px. The layer is 150% of the
 * viewport (enough for a ±45° rotation), so this is sized for a large desktop;
 * anything smaller simply has cells clipped by the layer's `overflow: hidden`.
 * The inline variant only ever fills a CMS preview box, so it covers far less.
 */
const COVER = { fixed: [2600, 1700], inline: [900, 700] } as const;
/** Hard ceiling on tile nodes, so a tiny tile cannot flood the DOM. */
const MAX_TILES = 1200;

type Props = {
  /** Absolute or app-relative URL of the tenant logo to tile. */
  logo: string;
  /**
   * A second image to intercalate with `logo`: when set, tiles alternate
   * between `logo` and this (a checkerboard of the two images). Used to tile
   * the logo and the brandmark together; left undefined when only one image is
   * being tiled.
   */
  secondaryLogo?: string;
  /** Drawn width of one logo, px. */
  size?: number;
  /** Empty space between logos, px. */
  spacing?: number;
  /** Rotation of the whole pattern, degrees. */
  rotation?: number;
  /**
   * Alternate each logo's rotation instead of tilting the whole pattern as one
   * block, so neighbouring logos lean opposite ways (a checkerboard of
   * +rotation / -rotation). `rotation` then reads as the alternation amplitude.
   */
  intercalated?: boolean;
  /** Opacity of the pattern as a whole percent (1-25). */
  opacity?: number;
  /**
   * Fill the nearest positioned ancestor instead of the viewport. Used by the
   * CMS preview, so what the operator tunes is rendered by the same component
   * the site uses rather than a lookalike that can drift from it.
   */
  inline?: boolean;
};

/**
 * Tiles the tenant's logo as a subtle, rotated watermark behind the page. The
 * page background color is untouched - this only layers texture on top of it.
 *
 * Each logo is its own cell in a grid rather than one repeating background,
 * because `background-size` on a raster image sets the drawn size *and* the
 * repeat period - there is no CSS way to leave a gap between copies. The cell
 * is `size + spacing` wide and the logo is drawn `size` wide inside it, which
 * makes the two sliders in the CMS independent.
 */
export function LogoWatermark({
  logo,
  secondaryLogo,
  size = 120,
  spacing = 70,
  rotation = -12,
  intercalated = false,
  opacity = 4,
  inline = false,
}: Props) {
  const tile = Math.max(size + spacing, 1);
  const [coverWidth, coverHeight] = COVER[inline ? "inline" : "fixed"];
  const cols = Math.ceil(coverWidth / tile);
  const rows = Math.ceil(coverHeight / tile);
  const count = Math.min(cols * rows, MAX_TILES);

  return (
    <div
      aria-hidden="true"
      className={[
        "logo-watermark",
        inline && "logo-watermark--inline",
        intercalated && "logo-watermark--intercalated",
        secondaryLogo && "logo-watermark--two-images",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--logo-watermark-image": `url("${encodeURI(logo)}")`,
          ...(secondaryLogo && {
            "--logo-watermark-image-2": `url("${encodeURI(secondaryLogo)}")`,
          }),
          "--logo-watermark-tile": `${tile}px`,
          "--logo-watermark-size": `${size}px`,
          "--logo-watermark-rotation": `${rotation}deg`,
          "--logo-watermark-opacity": opacity / 100,
        } as React.CSSProperties
      }
    >
      <div className="logo-watermark__grid">
        {/* Decorative cells - deliberately plain spans, not <Box>: there are
            hundreds of them and they carry no layout props of their own. */}
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="logo-watermark__tile" />
        ))}
      </div>
    </div>
  );
}
