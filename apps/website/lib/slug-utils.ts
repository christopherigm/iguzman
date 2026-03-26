/**
 * Generate a slug from a name string prefixed with the system ID.
 * Example: buildSlug('Clean Service', 1) → '1-clean-service'
 */
export function buildSlug(name: string, systemId: number): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')    // keep alphanum, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-');            // collapse consecutive hyphens
  return `${systemId}-${base}`;
}
