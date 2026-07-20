// Client-side ingredient cost estimation for the menu-item admin form.
//
// A menu item's ingredients each reference a reusable `Ingredient` that carries
// a purchasing `price` stated per `nutrition_basis_quantity` of its own `unit`
// (the same reference the FDA nutrition panel uses). This module scales that
// price to each menu-item row's recipe portion and default served quantity so
// the operator sees the estimated cost of the dish *as served by default*.
//
// The unit conversion mirrors `catalog/units.py` on the backend: only
// same-dimension conversions (mass↔mass, volume↔volume) and exact count-unit
// matches are supported; anything else is "not convertible" and the line's cost
// is left unknown rather than guessed.

import type {
  IngredientRow,
  IngredientOption,
} from "@/components/admin/menu-ingredients-editor";

// Each dimension maps a unit to its factor in that dimension's canonical base
// unit (grams for mass, millilitres for volume). Count units live in their own
// single-member dimensions so only an exact-unit match converts.
const MASS: Record<string, number> = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.349523125,
  lb: 453.59237,
};

const VOLUME: Record<string, number> = {
  ml: 1,
  l: 1000,
  cup: 236.5882365,
  tbsp: 14.78676478,
  tsp: 4.92892159,
};

const COUNT = new Set(["pc", "slice", "scoop"]);

const DIMENSIONS = [MASS, VOLUME];

function dimensionFactor(
  unit: string,
): [Record<string, number> | null, number] {
  for (const dim of DIMENSIONS) {
    if (unit in dim) return [dim, dim[unit] as number];
  }
  return [null, 0];
}

/**
 * Express `quantity` of `fromUnit` in `toUnit`. Returns a number when the two
 * units share a physical dimension (or are the same count unit), or `null` when
 * they are not inter-convertible (different dimensions, two different count
 * units) or any argument is missing.
 */
export function convertQuantity(
  quantity: number | null,
  fromUnit: string,
  toUnit: string,
): number | null {
  if (quantity === null || !fromUnit || !toUnit) return null;
  if (fromUnit === toUnit) return quantity;
  // Count units only convert to themselves (handled above); anything else here
  // is non-convertible.
  if (COUNT.has(fromUnit) || COUNT.has(toUnit)) return null;

  const [fromDim, fromFactor] = dimensionFactor(fromUnit);
  const [toDim, toFactor] = dimensionFactor(toUnit);
  if (fromDim === null || toDim === null || fromDim !== toDim || toFactor === 0)
    return null;

  return (quantity * fromFactor) / toFactor;
}

/** One ingredient's contribution to the estimated cost of the dish. */
export interface CostLine {
  /** Stable React key (the editor row's key). */
  key: string;
  /** Display name of the referenced ingredient (locale-aware). */
  name: string;
  /** The recipe portion, e.g. "100 g", or null when the portion is unset. */
  portionLabel: string | null;
  /** Units served by default: 1 for an included/internal ingredient, the
   *  default quantity for a removable add-on (often 0). */
  servedUnits: number;
  /** Cost of one served portion, or null when the ingredient is unpriced or the
   *  portion cannot be converted to the ingredient's unit. */
  unitCost: number | null;
  /** `unitCost × servedUnits`, or null when `unitCost` is unknown. */
  lineCost: number | null;
  /** The ingredient's own pricing currency, when priced. */
  currency: string | null;
  /** The ingredient carries no price. */
  unpriced: boolean;
  /** The portion could not be converted to the ingredient's unit. */
  notConvertible: boolean;
}

export interface IngredientsCost {
  lines: CostLine[];
  /** Sum of the known `lineCost`s. */
  total: number;
  /** At least one picked ingredient carries no price. */
  hasUnpriced: boolean;
  /** At least one picked ingredient's portion is not convertible to its unit. */
  hasNotConvertible: boolean;
  /** At least one priced ingredient is in a currency other than `currency`. */
  mixedCurrency: boolean;
}

/**
 * Build the cost breakdown for a menu item's ingredient rows against the tenant
 * catalog, in the menu item's `currency`.
 *
 * Only rows with a picked ingredient contribute. A row's served units follow the
 * default configuration of the dish: a non-removable (included or internal)
 * ingredient is served once; a removable add-on is served at its
 * `default_quantity`. Choice-group alternatives are not added on top of the
 * default option, so only the row's own `ingredient` is costed.
 */
export function computeIngredientsCost(
  rows: IngredientRow[],
  catalog: IngredientOption[],
  currency: string,
  locale: string,
): IngredientsCost {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const lines: CostLine[] = [];
  let total = 0;
  let hasUnpriced = false;
  let hasNotConvertible = false;
  let mixedCurrency = false;

  for (const row of rows) {
    if (row.ingredient === "") continue;
    const ing = byId.get(row.ingredient);
    const name = ing
      ? locale === "en"
        ? (ing.en_name ?? ing.name ?? String(ing.id))
        : (ing.name ?? ing.en_name ?? String(ing.id))
      : String(row.ingredient);

    const servedUnits = row.is_removable
      ? Number(row.default_quantity || 0)
      : 1;

    const qty = row.quantity === "" ? null : Number(row.quantity);
    const portionLabel = qty !== null && row.unit ? `${qty} ${row.unit}` : null;

    const priceStr = ing?.price ?? null;
    const unpriced = !ing || priceStr === null || priceStr === "";

    let unitCost: number | null = null;
    let notConvertible = false;

    if (!unpriced && ing) {
      const converted = convertQuantity(qty, row.unit, ing.unit);
      const basis = Number(ing.nutrition_basis_quantity || "0");
      if (converted === null || !basis) {
        notConvertible = true;
      } else {
        unitCost = (Number(priceStr) * converted) / basis;
      }
    }

    const lineCost = unitCost === null ? null : unitCost * servedUnits;
    if (lineCost !== null) total += lineCost;
    if (unpriced) hasUnpriced = true;
    if (notConvertible) hasNotConvertible = true;
    if (!unpriced && ing && ing.currency && ing.currency !== currency)
      mixedCurrency = true;

    lines.push({
      key: row.key,
      name,
      portionLabel,
      servedUnits,
      unitCost,
      lineCost,
      currency: ing?.currency ?? null,
      unpriced,
      notConvertible,
    });
  }

  return { lines, total, hasUnpriced, hasNotConvertible, mixedCurrency };
}
