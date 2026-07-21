/**
 * Pick the locale-appropriate value from a System (es) / en_ (en) field pair.
 *
 * Shared by this site's sections and pages so the fallback chain (requested
 * locale -> Spanish -> English) stays identical everywhere. Component-free, so
 * it is safe to import from any of them.
 */
export function localized(
  locale: string,
  es: string | null | undefined,
  en: string | null | undefined,
): string {
  return (locale === "en" ? en : es) ?? es ?? en ?? "";
}
