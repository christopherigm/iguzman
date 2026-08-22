/**
 * Build a record's slug: `{site_prefix}-{name}`.
 *
 * `prefix` is `System.site_prefix` — the per-site namespace that keeps two
 * tenants on this one database from colliding over a `slug` column that is
 * `unique=True` across the whole table. Read it from `useSitePrefix()`
 * (`app/[locale]/admin/site-prefix-provider.tsx`), never from the session's
 * `systemId`: this used to take the numeric id, and the resulting `1-latte`
 * URLs were both unreadable and a different shape from what `seed_site` wrote.
 *
 * ⚠ The transliteration here is mirrored character for character by
 * `slug_base` in website-api's `core/services/reslug.py`, which is what both
 * the clone endpoint and the CMS's "Recreate IDs" button build with. Change one
 * and you must change the other, or a record created through the form and the
 * same record rebuilt by that button land on different URLs.
 *
 * Example: `buildSlug('Clean Service', 'javastop')` → `'javastop-clean-service'`
 */
export function buildSlug(name: string, prefix: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "") // keep alphanum, spaces, hyphens
    .trim()
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/-+/g, "-"); // collapse consecutive hyphens
  // A nameless record still gets a namespaced slug rather than a bare prefix
  // with a trailing hyphen — same fallback the API's `build_slug` uses.
  return base ? `${prefix}-${base}` : `${prefix}-item`;
}
