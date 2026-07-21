/**
 * Section-band backgrounds (`System.catalog_items_bg` / `highlights_bg`) are
 * edited in the CMS with the shared `GradientBuilder`, which emits a radial
 * gradient as `radial-gradient(circle at center, …)`. A `circle` ignores the
 * box's aspect ratio: the section bands are wide, short rectangles, so the
 * circle is sized to reach the far corners and its colour transition runs off
 * the top and bottom edges - the glow "bleeds" vertically instead of fitting
 * the band.
 *
 * `fitSectionBackground` rewrites any radial gradient's shape/size descriptor to
 * `ellipse farthest-corner at center` so the gradient conforms to the
 * container's rectangle (an ellipse follows the box's aspect ratio; a circle
 * does not) with a soft falloff that reaches its final stop at the corners.
 * Non-radial values (solid colours, `color-mix()`, linear gradients) are
 * returned untouched.
 */

/** Split by top-level commas, ignoring commas nested inside parentheses. */
function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * Whether a radial-gradient's first top-level token is a shape/size/position
 * descriptor (e.g. `circle at center`, `ellipse farthest-corner`, `600px`)
 * rather than the first colour stop. Colour stops can be hex, `rgb()/hsl()`,
 * `var(--x)`, `color-mix(…)` or a named colour, so we detect the descriptor by
 * its own vocabulary instead of trying to enumerate every colour form.
 */
function isShapeDescriptor(part: string): boolean {
  return (
    /\b(?:circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner)\b/.test(
      part,
    ) ||
    /^at\b/.test(part) ||
    /^[\d.]+(?:px|%|em|rem|vh|vw)/.test(part)
  );
}

const FIT_SHAPE = "ellipse farthest-corner at center";

export function fitSectionBackground(background: string): string {
  const value = background.trim();
  const match = value.match(/^radial-gradient\((.+)\)$/s);
  if (!match?.[1]) return background;

  const parts = splitTopLevel(match[1]);
  const stops =
    parts[0] && isShapeDescriptor(parts[0]) ? parts.slice(1) : parts;
  if (stops.length < 2) return background;

  return `radial-gradient(${FIT_SHAPE}, ${stops.join(", ")})`;
}
