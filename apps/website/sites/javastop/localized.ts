/**
 * Pick the locale-appropriate value from a System (default) / `en_` field pair.
 *
 * Shared by this site's section and pages so the fallback chain (requested
 * locale -> primary copy -> English) stays identical everywhere. Component-free,
 * so it is safe to import from any of them.
 *
 * Note this café is an English-first business (Longmont, Colorado), so in
 * practice the `en_` half is the one that is filled - but the chain is written
 * the same way as every other site's, since which half a tenant authors in is a
 * CMS decision and not something the site folder may assume.
 */
export function localized(
  locale: string,
  primary: string | null | undefined,
  english: string | null | undefined,
): string {
  return (locale === "en" ? english : primary) ?? primary ?? english ?? "";
}
