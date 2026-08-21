/**
 * Contrast arithmetic on a brand colour.
 *
 * Plain functions over strings - no React, no DOM - so a server component, a
 * client provider and a canvas export can all reach for the same answer.
 *
 * The problem it exists for: a palette ships a **different** accent per theme
 * (`cyan` is `#06b6d4` light / `#22d3ee` dark) precisely so accent-coloured text
 * stays readable in both. `PaletteProvider`'s `accent` prop overrides that with
 * **one** customer hex for both themes - which is what a brand colour is - and
 * text painted in it is then legible in only one of them. A brand navy prints
 * beautifully on a light card and vanishes into a dark one; a brand yellow does
 * the reverse.
 *
 * `readableOn` answers with the same colour made legible: hue and saturation
 * kept, lightness walked until it clears the target ratio. Replacing the accent
 * with white in dark mode would fix half the problem and throw the brand away
 * doing it.
 */

// --- Types ---

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** The subset of a `PaletteDefinition` this module reads. */
export interface InkPalette {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** Extra per-theme backgrounds an app paints that the palette doesn't name -
 *  e.g. a tenant-configured page background. */
export interface InkSurfaces {
  light?: (string | undefined)[];
  dark?: (string | undefined)[];
}

// --- Colour helpers ---

function parseHex(hex: string | undefined): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m || !m[1]) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const pair = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

// --- Public API ---

/** WCAG contrast ratio between two hex colours; `null` if either won't parse. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  return ratio(luminance(ca), luminance(cb));
}

/**
 * `hex`, made legible as **ink** on every one of `backgrounds` - its hue and
 * saturation kept, its lightness walked toward whichever end of the scale those
 * backgrounds are furthest from until it clears `target` (WCAG AA body text,
 * 4.5:1) against all of them. A colour that already clears it comes back
 * unchanged, so the common case costs nothing.
 *
 * ⚠ Only ever apply the result to **ink** - anything drawn *on* a surface rather
 * than being one. Text, a masked glyph, a 2px underline, and a low-opacity tint
 * or outline washed over the page are all ink: nothing sits inside them to
 * answer for their contrast, so a brand navy makes them vanish on a dark page.
 * A **filled surface** - a primary button, a `filled` badge, a solid icon
 * button, a slider track, a map pin - keeps the raw accent: there the brand hex
 * *is* the surface and its own foreground answers for the contrast, so adjusting
 * it repaints the customer's brand rather than making it readable.
 *
 * ⚠ "A border" is on neither list by itself, and the test is which of the two it
 * is doing. A rim around a filled surface is part of that fill and keeps
 * `--accent` (`IconButton`'s `KIND_SOLID_BORDERS`); a hairline outline drawn on
 * the page to give a ghost control a shape is ink and follows this
 * (`KIND_BORDERS`).
 *
 * Pass same-theme backgrounds only: a list holding both a white and a near-black
 * has no answer, and the walk would run to an extreme.
 *
 * Returns `null` when `hex` is not a six-digit hex, so a caller can publish
 * nothing and let its own `var(--accent)` fallback stand.
 */
export function readableOn(
  hex: string | undefined,
  backgrounds: (string | undefined)[],
  target = 4.5,
): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;

  const bgs = backgrounds
    .map(parseHex)
    .filter((c): c is Rgb => c !== null)
    .map(luminance);
  if (bgs.length === 0) return null;

  const worst = (l: number) => Math.min(...bgs.map((bg) => ratio(l, bg)));
  if (worst(luminance(rgb)) >= target) return toHex(rgb);

  // Whichever end of the scale is further from these backgrounds is the one
  // worth walking toward - a dark accent on dark surfaces lightens, a light one
  // on light surfaces darkens.
  const lighten = worst(1) > worst(0);
  const { h, s, l: start } = rgbToHsl(rgb);

  for (let step = 1; step <= 100; step++) {
    const l = lighten
      ? Math.min(1, start + step / 100)
      : Math.max(0, start - step / 100);
    const candidate = hslToRgb(h, s, l);
    if (worst(luminance(candidate)) >= target) return toHex(candidate);
    if (l === 0 || l === 1) break;
  }

  // A fully saturated hue can be too light or too dark to ever clear the target
  // (pure yellow never contrasts with white). Ending at the extreme is still the
  // most readable answer available.
  return lighten ? "#ffffff" : "#000000";
}

/**
 * The two `--accent-text-*` custom properties for a palette and an accent
 * override - the values `PaletteProvider` publishes and an app's own layout can
 * publish inline for the first paint. Both callers go through this one function
 * so the server-rendered value and the client-recomputed one cannot disagree.
 *
 * The surfaces measured against are the palette's own `--background`,
 * `--surface-1` and `--surface-2` for that theme, plus anything the app adds via
 * `extra` (a tenant-configured page background belongs there).
 *
 * With no `accent` override each theme is measured against **its own** palette
 * accent, which the palette already varies per theme - so a palette-only app
 * gets the two colours it already had and nothing moves.
 *
 * A key is omitted when the accent will not parse, leaving the consumer's
 * `var(--accent-text, var(--accent))` fallback to answer.
 */
export function accentInkVariables(
  accent: string | undefined,
  palette: InkPalette | undefined,
  extra?: InkSurfaces,
): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!palette) return vars;

  const inkFor = (
    theme: Record<string, string>,
    added: (string | undefined)[],
  ) =>
    readableOn(accent ?? theme["--accent"], [
      theme["--background"],
      theme["--surface-1"],
      theme["--surface-2"],
      ...added,
    ]);

  const light = inkFor(palette.light, extra?.light ?? []);
  const dark = inkFor(palette.dark, extra?.dark ?? []);

  if (light) vars["--accent-text-light"] = light;
  if (dark) vars["--accent-text-dark"] = dark;
  return vars;
}
