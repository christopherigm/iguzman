/**
 * What *this tenant* calls the two Buyable families it sells.
 *
 * A workshop's services are "Lo que hacemos". `System` carries a bilingual
 * label column pair for products and for services, and this module turns those
 * columns into the strings the site paints - falling back to the app's own
 * translations wherever a tenant has typed nothing.
 *
 * **A menu is absent on purpose.** It is sectioned by the tenant's own
 * `MenuCategory` rows, which are already their own copy, so there is nothing
 * here for a label to rename. This used to carry five more kinds
 * (food/drink/dessert/side/appetizer) alongside these two; both they and their
 * ten `System` columns are gone.
 *
 * ⚠ **These rename a label and nothing else.** Every URL
 * (`/categories/products`, `/products/<slug>`) is structural: renaming
 * "Products" must not move a page a customer has bookmarked. Never build a path
 * from a label.
 *
 * Plain data with no server import, for the same reason `menu-paths.ts` is: the
 * navbar is a **client** component and needs this, while `lib/system.ts` reaches
 * `next/headers` through `resolve-site.ts` to resolve the tenant. That is why
 * `KindLabelOverrides` is declared here structurally rather than imported from
 * the `System` type - `System` extends it, not the other way round.
 */

/** The two Buyable families a tenant may rename. Mirrors `CATALOG_KINDS` in
 *  `core/models.py`. */
export type CatalogKind = "product" | "service";

export const CATALOG_KINDS: CatalogKind[] = ["product", "service"];

/**
 * The `System` columns behind the labels - the bare field is the tenant's
 * Spanish copy and `en_*` the English one, exactly like `name` / `en_name` on
 * every other model. Blank (or null) means "no override", which is the state of
 * every tenant that has never opened the section.
 */
export interface KindLabelOverrides {
  kind_label_product: string | null;
  en_kind_label_product: string | null;
  kind_label_service: string | null;
  en_kind_label_service: string | null;
}

/** The overrides a tenant actually typed, resolved for one locale. A family
 *  with no override is **absent**, never an empty string - so a consumer can
 *  read it as "did the tenant rename this?" without a truthiness dance. */
export type KindLabels = Partial<Record<CatalogKind, string>>;

/** The two column names holding one family's label. Derived rather than typed
 *  out so a family added to `CATALOG_KINDS` cannot be half-wired. */
function columnsFor(
  kind: CatalogKind,
): [keyof KindLabelOverrides, keyof KindLabelOverrides] {
  return [
    `kind_label_${kind}` as keyof KindLabelOverrides,
    `en_kind_label_${kind}` as keyof KindLabelOverrides,
  ];
}

/**
 * Resolve every override for one locale, dropping the blanks.
 *
 * The locale rule is the site's usual one (see `metadata.ts`, `buyable-card-view`):
 * English reads `en_*` and falls back to the Spanish copy, everything else reads
 * the Spanish copy and falls back to English. A tenant who filled only one
 * language is therefore renamed everywhere rather than renamed on half the site.
 */
export function kindLabels(
  system:
    | Partial<KindLabelOverrides>
    // The CMS reads the System through `lib/admin-api.ts`, which parses every
    // payload as an untyped record - so this takes one of those too rather than
    // making each caller assert a shape the API already guarantees.
    | Record<string, unknown>
    | null
    | undefined,
  locale: string,
): KindLabels {
  if (!system) return {};
  const row = system as Record<string, unknown>;

  const read = (column: keyof KindLabelOverrides): string =>
    typeof row[column] === "string" ? (row[column] as string) : "";

  const labels: KindLabels = {};
  for (const kind of CATALOG_KINDS) {
    const [es, en] = columnsFor(kind);
    const preferred = locale === "en" ? read(en) : read(es);
    const other = locale === "en" ? read(es) : read(en);
    const value = (preferred || other).trim();
    if (value) labels[kind] = value;
  }
  return labels;
}

/**
 * The label to print for one family: the tenant's own, or the app's translation.
 *
 * `fallback` is always evaluated by the caller (a `t(...)` call), which is what
 * keeps this module free of i18n - and what makes an un-renamed site render
 * exactly as it did before this feature existed.
 */
export function kindLabel(
  labels: KindLabels | undefined,
  kind: CatalogKind,
  fallback: string,
): string {
  return labels?.[kind] ?? fallback;
}
