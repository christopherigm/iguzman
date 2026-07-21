/**
 * Pure helpers for the tenant's typography settings (`System.google_font_url`,
 * `font_display`, `font_body`).
 *
 * They live here rather than in `lib/system.ts` because both a **server**
 * component (the locale layout, which renders the stylesheet link) and a
 * **client** component (the CMS's typography section, which previews it) need
 * them. `lib/system.ts` reaches the tenant through `resolve-site` →
 * `sites/registry` → every site's landing, and transitively `next/headers`;
 * importing it from a `"use client"` file drags all of that into the browser
 * bundle and fails the build with "You're importing a module that depends on
 * next/headers". Keep this file free of any import that is not pure.
 */

/**
 * Whether a stored `google_font_url` is safe to render as a stylesheet `<link>`.
 *
 * The API validates this on write, but the check is repeated here because the
 * value crosses a trust boundary on the way out: it lands in the document head
 * of every page of a tenant's site, so an unvalidated one (a row seeded before
 * the validator existed, or written straight into the DB) would pull a
 * stylesheet from an arbitrary origin. Cheap to re-check, expensive to miss.
 */
export function isGoogleFontUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === "fonts.googleapis.com" || hostname === "fonts.gstatic.com")
    );
  } catch {
    return false;
  }
}

/**
 * Quotes a tenant-supplied CSS family name for use in a `font-family` value.
 *
 * The name reaches an inline `style` attribute, so a name containing a quote or
 * a semicolon could otherwise close the declaration and inject another. Anything
 * outside the characters a real family name uses is rejected outright (returns
 * `null`, i.e. "fall back to the default stack") rather than escaped.
 */
export function cssFontFamily(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9 _-]{1,64}$/.test(trimmed)) return null;
  return `"${trimmed}"`;
}
