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
