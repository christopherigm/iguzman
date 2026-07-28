/**
 * Resolving the API's bilingual field pairs for the current locale.
 *
 * animals-api stores every authored text field as a **pair**: the bare field
 * (`name`, `description`, `short_description`) is **Spanish**, its `en_` twin is
 * **English**. The API publishes both members raw and resolves nothing - its
 * payloads are cached under one key per resource, so a locale-resolved variant
 * would be written into that same key and then served to the next reader in the
 * wrong language. Picking one is therefore the frontend's job, and this module
 * is the single place that does it.
 *
 * The app ships five locales but the backend stores two languages: `es` reads
 * the bare field, every other locale reads the `en_` twin and falls back to the
 * bare field when the translation is blank (de/fr/pt readers get the English).
 */

/**
 * The value of `field` in `locale`'s language, or `null` when both members are
 * empty.
 *
 * The fallback is deliberately one-way: an English reader falls back to the
 * Spanish text (better a legible entry than a blank card), but a Spanish reader
 * never sees `en_*` - the bare column is the one an author is expected to fill.
 *
 * `record` is typed as a plain `object` rather than an index signature so the
 * app's own payload interfaces (`Species`, `Sighting`, …) can be passed
 * directly - a declared interface has no implicit index signature, so a
 * `Record<string, unknown>` parameter would reject every one of them. It also
 * takes the small ad-hoc literals built from a serializer's *flattened* labels
 * (`{ name: species_name, en_name: species_en_name }`), which is why the field
 * name cannot be constrained to `keyof` anything.
 */
export function localized(
  record: object | null | undefined,
  field: string,
  locale: string,
): string | null {
  if (!record) return null;
  const source = record as Record<string, unknown>;

  const base = asText(source[field]);
  if (locale === 'es') return base;

  return asText(source[`en_${field}`]) ?? base;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
