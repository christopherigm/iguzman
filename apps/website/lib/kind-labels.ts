/**
 * What *this tenant* calls each kind of thing it sells.
 *
 * A pizzeria's menu section is "Pizzas", not "Food"; a workshop's services are
 * "Lo que hacemos". `System` carries a bilingual label column pair for each of
 * the seven catalog kinds (the five `MenuItemKind`s plus the two other Buyable
 * families), and this module turns those columns into the strings the site
 * paints - falling back to the app's own translations wherever a tenant has
 * typed nothing.
 *
 * ⚠ **These rename a label and nothing else.** The kind values, the API's
 * `?kind=` filter and every URL (`/categories/food`, `/food/<slug>`) are
 * structural: renaming "Food" to "Pizzas" must not move a page a customer has
 * bookmarked. Never build a path from a label.
 *
 * Plain data with no server import, for the same reason `menu-kinds.ts` is: the
 * navbar is a **client** component and needs this, while `lib/system.ts` reaches
 * `next/headers` through `resolve-site.ts` to resolve the tenant. That is why
 * `KindLabelOverrides` is declared here structurally rather than imported from
 * the `System` type - `System` extends it, not the other way round.
 */

import { MENU_ITEM_KINDS, type MenuItemKind } from "./menu-kinds";

/** Everything a tenant sells and may therefore rename: the five menu kinds plus
 *  the two other Buyable families. Mirrors `CATALOG_KINDS` in `core/models.py`. */
export type CatalogKind = MenuItemKind | "product" | "service";

/** In the order a site reads: the menu, then the other two families. */
export const CATALOG_KINDS: CatalogKind[] = [
  ...MENU_ITEM_KINDS,
  "product",
  "service",
];

/**
 * The `System` columns behind the labels - the bare field is the tenant's
 * Spanish copy and `en_*` the English one, exactly like `name` / `en_name` on
 * every other model. Blank (or null) means "no override", which is the state of
 * every tenant that has never opened the section.
 */
export interface KindLabelOverrides {
  kind_label_food: string | null;
  en_kind_label_food: string | null;
  kind_label_drink: string | null;
  en_kind_label_drink: string | null;
  kind_label_dessert: string | null;
  en_kind_label_dessert: string | null;
  kind_label_side: string | null;
  en_kind_label_side: string | null;
  kind_label_appetizer: string | null;
  en_kind_label_appetizer: string | null;
  kind_label_product: string | null;
  en_kind_label_product: string | null;
  kind_label_service: string | null;
  en_kind_label_service: string | null;
}

/** The overrides a tenant actually typed, resolved for one locale. A kind with
 *  no override is **absent**, never an empty string - so a consumer can read it
 *  as "did the tenant rename this?" without a truthiness dance. */
export type KindLabels = Partial<Record<CatalogKind, string>>;

/** The two column names holding one kind's label. Derived rather than typed out
 *  so a kind added to `CATALOG_KINDS` cannot be half-wired. */
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
 * The label to print for one kind: the tenant's own, or the app's translation.
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

/**
 * The CMS's way of naming a kind: the canonical label, plus the tenant's own in
 * parentheses when they have renamed it - "Food (Pizzas)".
 *
 * Deliberately *both*, unlike the storefront. An operator picking a kind on the
 * menu-item form is setting a structural field that drives routes and filters,
 * so the canonical name has to stay visible; but a menu of "Food / Drink / Side"
 * is unrecognisable to someone whose whole site says Pizzas, Bebidas, Extras.
 */
export function kindLabelWithOverride(
  labels: KindLabels | undefined,
  kind: CatalogKind,
  canonical: string,
): string {
  const override = labels?.[kind];
  return override && override !== canonical
    ? `${canonical} (${override})`
    : canonical;
}
