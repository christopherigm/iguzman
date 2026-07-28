/**
 * Derive a URL slug from a record's name.
 *
 * No system-id prefix, unlike website's version of this: slugs there have to be
 * unique across every tenant sharing one table, so each is prefixed with the
 * tenant's id. This backend is single-tenant, so a slug can just be the name -
 * which is also what makes `/species/venado-cola-blanca` readable.
 *
 * Diacritics are stripped rather than dropped (`otoño` → `otono`), because the
 * Spanish half of every name pair is the one an author types first.
 */
export function buildSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '') // keep alphanumerics, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
