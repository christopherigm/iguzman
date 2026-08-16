/**
 * Colour arithmetic on the tenant's own brand hexes.
 *
 * Plain functions over strings - no React, no `next/headers` - so a server
 * component, a client component and a canvas export can all reach for the same
 * answer. It lives here rather than beside its first consumer because the two
 * that need it now (the CMS's flyer templates and the locale layout, which
 * publishes the brand colours as CSS variables) are in different halves of the
 * app.
 */

/**
 * Pick black or white for legible text over a solid background colour, via
 * relative luminance. Used so a headline - or a nav entry lit in the tenant's
 * secondary colour - stays readable whatever brand colour the tenant chose.
 */
export function contrastText(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m || !m[1]) return "#ffffff";
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}
