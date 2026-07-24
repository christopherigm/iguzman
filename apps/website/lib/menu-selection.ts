import type {
  Ingredient,
  MenuItemIngredient,
  MenuItemIngredientOption,
} from "./catalog";

/**
 * One selectable choice within a menu ingredient group, flattened to the shape
 * both the customiser (buttons + price) and the nutrition label (scaled from
 * `ingredient_detail`) need. The group's own fields are the *default* choice;
 * `options` are the alternatives.
 *
 * Shared here (rather than in either component) because the customiser and the
 * nutrition label both resolve the customer's chosen option the same way.
 */
export interface IngredientChoice {
  /** The Ingredient id — the selection value and the default marker. */
  ingredient: number;
  name: string;
  en_name: string | null;
  image: string | null;
  price: string;
  calories: number | null;
  ingredient_detail?: Ingredient;
}

/** Every choice for a group: the default (the group's own fields) first, then
 *  its alternatives in the admin-set order. A group with no options yields one. */
export function ingredientChoices(ing: MenuItemIngredient): IngredientChoice[] {
  const def: IngredientChoice = {
    ingredient: ing.ingredient,
    name: ing.name,
    en_name: ing.en_name,
    image: ing.image,
    price: ing.price,
    calories: ing.calories,
    ingredient_detail: ing.ingredient_detail,
  };
  const alternatives = (ing.options ?? []).map(
    (o: MenuItemIngredientOption): IngredientChoice => ({
      ingredient: o.ingredient,
      name: o.name,
      en_name: o.en_name,
      image: o.image,
      price: o.price,
      calories: o.calories,
      ingredient_detail: o.ingredient_detail,
    }),
  );
  return [def, ...alternatives];
}

/** True when the group offers a single-select choice (has alternatives). */
export function isChoiceGroup(ing: MenuItemIngredient): boolean {
  return (ing.options?.length ?? 0) > 0;
}

/** The choice matching `optionId` (an Ingredient id), defaulting to the group's
 *  default choice when the id is absent or unrecognised. Never returns null. */
export function resolveChoice(
  ing: MenuItemIngredient,
  optionId: number | undefined,
): IngredientChoice {
  const choices = ingredientChoices(ing);
  return (
    (optionId != null && choices.find((c) => c.ingredient === optionId)) ||
    choices[0]!
  );
}

/** Per-ingredient chosen quantity, keyed by `MenuItemIngredient.id`. */
export type SelectionQuantities = Record<number, number>;

/** Per-ingredient chosen alternative (an `Ingredient` id), keyed the same way.
 *  An absent entry means the group's own default choice. */
export type SelectionOptions = Record<number, number>;

/**
 * The ingredients a customer may actually configure.
 *
 * Internal ingredients are kitchen-only recipe components: hidden from every
 * customiser and excluded from the price, exactly as the server excludes them in
 * `price_for_selection`. They still reach the nutrition label, which reads the
 * full list separately, because they really are in the food.
 */
export function customizableIngredients(
  ingredients: MenuItemIngredient[],
): MenuItemIngredient[] {
  return ingredients.filter((ing) => !ing.is_internal);
}

/** The lowest quantity a group may be taken to: an included (non-removable)
 *  ingredient is locked at 1, everything else can go to 0. */
export function minQuantity(ing: MenuItemIngredient): number {
  return ing.is_removable ? 0 : 1;
}

/**
 * The up-charge a selection adds to a menu item's base price.
 *
 * Mirrors the server's `upcharge_for_quantity`: the base already paid for the
 * default option's included units, so only the value the customer's *chosen*
 * option × quantity exceeds that baseline is charged, and it never goes
 * negative - removing a default does not refund.
 *
 * This is a **display** figure. The server recomputes it from the same rules on
 * every checkout, and its answer is the one that is stored and charged; a
 * disagreement here would show a wrong number, never bill a wrong one.
 */
export function selectionUpcharge(
  ingredients: MenuItemIngredient[],
  quantities: SelectionQuantities,
  options: SelectionOptions,
): number {
  let sum = 0;
  for (const ing of customizableIngredients(ingredients)) {
    const qty = quantities[ing.id] ?? ing.default_units;
    const choice = resolveChoice(ing, options[ing.id]);
    const includedValue = parseFloat(ing.price) * ing.included_units;
    const selectedValue = parseFloat(choice.price) * qty;
    sum += Math.max(0, selectedValue - includedValue);
  }
  return sum;
}

/** One chosen ingredient, in the shape the API's `customization` payload takes. */
export interface CustomizationRow {
  ingredient: number;
  quantity: number;
  option?: number;
}

/**
 * The selection, reduced to only what differs from the item as listed.
 *
 * A row travels when its quantity moved off `default_units` **or** a non-default
 * option was picked; everything else is already implied by the menu item, and
 * the server normalises what does arrive. Nothing here names a price.
 */
export function buildCustomization(
  ingredients: MenuItemIngredient[],
  quantities: SelectionQuantities,
  options: SelectionOptions,
): CustomizationRow[] {
  const rows: CustomizationRow[] = [];
  for (const ing of customizableIngredients(ingredients)) {
    const chosen = options[ing.id] ?? ing.ingredient;
    const isDefaultOption = chosen === ing.ingredient;
    const quantity = quantities[ing.id] ?? ing.default_units;
    if (quantity === ing.default_units && isDefaultOption) continue;
    rows.push({
      ingredient: ing.id,
      quantity,
      // Only carried when an alternative was swapped in; the server normalises
      // anyway, this just keeps the payload lean.
      ...(isDefaultOption ? {} : { option: chosen }),
    });
  }
  return rows;
}
