import type { MenuItemIngredient } from "@/lib/catalog";

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
