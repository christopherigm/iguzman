import type { IngredientNutrition, MenuItemIngredient } from "@/lib/catalog";

/**
 * The ingredients that can contribute to the nutrition breakdown: only those
 * with a descriptive portion (quantity + unit) *and* a positive calorie value.
 * An ingredient missing any of these can't be meaningfully charted, so it is
 * left out entirely.
 *
 * This is the quantity-independent gate (does the item have chartable data at
 * all?); the label itself further narrows to the ingredients the customer has
 * actually selected.
 */
export function nutritionRows(
  ingredients: MenuItemIngredient[],
): MenuItemIngredient[] {
  return ingredients.filter(
    (i) =>
      i.quantity != null &&
      i.unit != null &&
      i.calories != null &&
      i.calories > 0,
  );
}

// ---------------------------------------------------------------------------
// Portion scaling (mirrors the backend so the full FDA label can be computed
// client-side from the already-embedded `ingredient_detail`)
// ---------------------------------------------------------------------------
//
// Port of `catalog/units.py` + `Ingredient.nutrient_for_portion`. Nutrition on
// an ingredient is stated per `nutrition_basis_quantity` of its own `unit`; a
// recipe portion may be expressed in a different unit of the same dimension.
// `scaleNutrient` converts the portion into the ingredient's basis unit and
// scales the per-basis value accordingly. Only same-dimension conversions are
// supported (mass<->mass, volume<->volume, exact count-unit match); anything
// else yields `null` ("cannot compute"), matching the backend.

/** Factor to the dimension's canonical base unit (grams for mass). */
const MASS: Record<string, number> = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.349523125,
  lb: 453.59237,
};

/** Factor to the dimension's canonical base unit (millilitres for volume). */
const VOLUME: Record<string, number> = {
  ml: 1,
  l: 1000,
  cup: 236.5882365,
  tbsp: 14.78676478,
  tsp: 4.92892159,
};

/** Count units convert only to themselves (no cross-conversion). */
const COUNT = new Set(["pc", "slice", "scoop"]);

/**
 * Express `quantity` of `fromUnit` in `toUnit`. Returns a number when the two
 * units share a physical dimension (or are the same count unit), else `null`.
 */
export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  if (!Number.isFinite(quantity) || !fromUnit || !toUnit) return null;
  if (fromUnit === toUnit) return quantity;
  // Count units only match themselves (handled above); anything else is
  // non-convertible.
  if (COUNT.has(fromUnit) || COUNT.has(toUnit)) return null;

  const fromMass = MASS[fromUnit];
  const toMass = MASS[toUnit];
  if (fromMass != null && toMass != null) return (quantity * fromMass) / toMass;

  const fromVol = VOLUME[fromUnit];
  const toVol = VOLUME[toUnit];
  if (fromVol != null && toVol != null) return (quantity * fromVol) / toVol;

  return null;
}

/**
 * One recipe portion's contribution of a single nutrient, scaled from the
 * embedded ingredient's per-basis value. Returns `null` when the ingredient
 * isn't embedded, the portion is undescribed or not convertible to the basis
 * unit, the basis is zero, or the nutrient is unset - matching the backend's
 * `nutrient_for_portion`.
 */
export function scaleNutrient(
  ing: MenuItemIngredient,
  field: keyof IngredientNutrition,
): number | null {
  const detail = ing.ingredient_detail;
  if (!detail || ing.quantity == null || ing.unit == null) return null;
  const raw = detail[field];
  if (raw == null) return null;
  const basis = Number(detail.nutrition_basis_quantity);
  if (!basis) return null;
  const baseQty = convertQuantity(Number(ing.quantity), ing.unit, detail.unit);
  if (baseQty == null) return null;
  return (Number(raw) * baseQty) / basis;
}

// ---------------------------------------------------------------------------
// FDA "Nutrition Facts" panel layout
// ---------------------------------------------------------------------------

/** The 14 charted nutrients below Calories (which is the headline figure). */
export type NutrientKey = Exclude<keyof IngredientNutrition, "calories">;

export interface NutrientRowMeta {
  key: NutrientKey;
  /** `Menu` namespace translation key for the label. */
  labelKey: string;
  /** Unit symbol appended to the amount. */
  unit: "g" | "mg" | "mcg";
  /** FDA reference Daily Value (same unit), or null when no %DV is shown. */
  dailyValue: number | null;
  /** Nesting depth under a parent nutrient (0 = top level). */
  indent: 0 | 1 | 2;
  /** Rendered in bold (the FDA's mandatory bold nutrients). */
  bold: boolean;
  /** `macro` rows precede the thick rule; `micro` rows (vitamins) follow it. */
  group: "macro" | "micro";
  /** Added Sugars renders as "Includes {amount} Added Sugars". */
  includes?: boolean;
}

/**
 * The classic FDA Nutrition Facts nutrient order, with the 2016 reference
 * Daily Values, indentation, and bold treatment. `total_sugars` and `trans_fat`
 * carry no %DV; protein's %DV is optional and omitted by convention.
 */
export const NUTRIENT_ROWS: NutrientRowMeta[] = [
  { key: "total_fat", labelKey: "totalFat", unit: "g", dailyValue: 78, indent: 0, bold: true, group: "macro" },
  { key: "saturated_fat", labelKey: "saturatedFat", unit: "g", dailyValue: 20, indent: 1, bold: false, group: "macro" },
  { key: "trans_fat", labelKey: "transFat", unit: "g", dailyValue: null, indent: 1, bold: false, group: "macro" },
  { key: "cholesterol", labelKey: "cholesterol", unit: "mg", dailyValue: 300, indent: 0, bold: true, group: "macro" },
  { key: "sodium", labelKey: "sodium", unit: "mg", dailyValue: 2300, indent: 0, bold: true, group: "macro" },
  { key: "total_carbohydrate", labelKey: "totalCarbohydrate", unit: "g", dailyValue: 275, indent: 0, bold: true, group: "macro" },
  { key: "dietary_fiber", labelKey: "dietaryFiber", unit: "g", dailyValue: 28, indent: 1, bold: false, group: "macro" },
  { key: "total_sugars", labelKey: "totalSugars", unit: "g", dailyValue: null, indent: 1, bold: false, group: "macro" },
  { key: "added_sugars", labelKey: "includesAddedSugars", unit: "g", dailyValue: 50, indent: 2, bold: false, group: "macro", includes: true },
  { key: "protein", labelKey: "protein", unit: "g", dailyValue: null, indent: 0, bold: true, group: "macro" },
  { key: "vitamin_d", labelKey: "vitaminD", unit: "mcg", dailyValue: 20, indent: 0, bold: false, group: "micro" },
  { key: "calcium", labelKey: "calcium", unit: "mg", dailyValue: 1300, indent: 0, bold: false, group: "micro" },
  { key: "iron", labelKey: "iron", unit: "mg", dailyValue: 18, indent: 0, bold: false, group: "micro" },
  { key: "potassium", labelKey: "potassium", unit: "mg", dailyValue: 4700, indent: 0, bold: false, group: "micro" },
];

/** Amount formatted with its unit: grams to 0.1 g, mg/mcg to whole numbers. */
export function formatNutrientAmount(value: number, unit: string): string {
  const rounded = unit === "g" ? Math.round(value * 10) / 10 : Math.round(value);
  const num = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${num}${unit}`;
}
