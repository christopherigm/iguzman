import React, { CSSProperties } from "react";
import "./barcode.css";

/**
 * Bar height preset for the barcode.
 * - `sm` - short (40 px) - inline / under a thumbnail
 * - `md` - medium (64 px) - default
 * - `lg` - tall (100 px) - prominent / print-style label
 */
export type BarcodeSize = "sm" | "md" | "lg";

/**
 * Props for the `Barcode` component.
 */
export interface BarcodeProps {
  /** The value to encode (typically the barcode digits). */
  value: string;
  /** Bar height preset. @default 'md' */
  height?: BarcodeSize;
  /** Bar (and human-readable text) color. @default '#000000' */
  color?: string;
  /** Background behind the bars. @default '#ffffff' (needed for scannability). */
  background?: string;
  /** Render the human-readable value beneath the bars. @default true */
  showText?: boolean;
  /** Extra CSS class names. */
  className?: string;
  /** Inline style overrides. */
  style?: CSSProperties;
}

const BAR_HEIGHTS: Record<BarcodeSize, number> = {
  sm: 40,
  md: 64,
  lg: 100,
};

/** Quiet zone (blank margin) on each side, in modules. */
const QUIET_ZONE = 10;

/**
 * Code 128 module-width patterns for symbol values 0-106.
 * Each entry is a run-length string (bar, space, bar, …) summing to 11 modules
 * (the final stop pattern, index 106, is 13 modules / 7 elements).
 */
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/**
 * Encode a string to Code 128 (subset B) symbol values, including the start
 * code, modulo-103 checksum, and stop code. Characters outside the printable
 * ASCII range (32-126) are skipped so an unexpected value never throws.
 */
function encodeCode128B(value: string): number[] {
  const codes: number[] = [START_B];
  let checksum = START_B;
  let position = 1;

  for (const char of value) {
    const symbol = char.charCodeAt(0) - 32;
    if (symbol < 0 || symbol > 94) continue;
    codes.push(symbol);
    checksum += symbol * position;
    position += 1;
  }

  codes.push(checksum % 103);
  codes.push(STOP);
  return codes;
}

/** Turn encoded symbol values into positioned bar rectangles (in module units). */
function buildBars(codes: number[]): { bars: { x: number; w: number }[]; width: number } {
  const bars: { x: number; w: number }[] = [];
  let x = QUIET_ZONE;

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i++) {
      const w = Number(pattern[i]);
      if (i % 2 === 0) bars.push({ x, w }); // even index = bar, odd = space
      x += w;
    }
  }

  return { bars, width: x + QUIET_ZONE };
}

/**
 * Barcode - renders a scannable Code 128 barcode from a string value.
 *
 * The bars stretch to fill the container width (any quiet-zone-preserving
 * width remains scannable), while `height` controls the bar height preset.
 *
 * @example
 * <Barcode value="9781234567897" />
 * @example
 * <Barcode value={item.barcode} height="sm" showText={false} />
 */
export const Barcode: React.FC<BarcodeProps> = ({
  value,
  height = "md",
  color = "#000000",
  background = "#ffffff",
  showText = true,
  className,
  style,
}) => {
  if (!value) return null;

  const { bars, width } = buildBars(encodeCode128B(value));
  const barHeight = BAR_HEIGHTS[height];

  const classes = ["ui-barcode", className].filter(Boolean).join(" ");

  return (
    <span
      className={classes}
      style={{ "--barcode-bg": background, ...style } as CSSProperties}
    >
      <svg
        className="ui-barcode__svg"
        width="100%"
        height={barHeight}
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        role="img"
        aria-label={value}
      >
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={0}
            width={bar.w}
            height={100}
            fill={color}
          />
        ))}
      </svg>
      {showText && (
        <span className="ui-barcode__text" style={{ color }}>
          {value}
        </span>
      )}
    </span>
  );
};

export default Barcode;
