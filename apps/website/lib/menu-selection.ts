import type {
  Ingredient,
  MenuItemIngredient,
  MenuItemIngredientOption,
  MenuSize,
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

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------
//
// A dish's `sizes` array is *already* the effective list (own rows else the
// category's, empty when the switch is off) - the server resolves that, so
// nothing below re-derives it. What lives here is only the arithmetic and the
// default, which the customiser, the card modal and the till all share for the
// same reason they share `selectionUpcharge`: a pizza configured at the counter
// and the same pizza configured on the site must not quote different numbers.

/**
 * The size a customer starts on: the row flagged `is_default`, else the first in
 * the API's order. `null` when the dish is sold in one size.
 *
 * Mirrors the server's `MenuItem.default_size`, so a line added without touching
 * the picker is priced identically wherever it was added from.
 */
export function defaultSize(sizes: MenuSize[]): MenuSize | null {
  return sizes.find((s) => s.is_default) ?? sizes[0] ?? null;
}

/** The chosen size, falling back to the default - the client half of the
 *  server's `resolve_size`. Never returns a size the dish does not offer. */
export function resolveSize(
  sizes: MenuSize[],
  sizeId: number | undefined,
): MenuSize | null {
  if (sizeId != null) {
    const match = sizes.find((s) => s.id === sizeId);
    if (match) return match;
  }
  return defaultSize(sizes);
}

/** What the chosen size adds to (or takes off) the base price. Signed. */
export function sizeDelta(
  sizes: MenuSize[],
  sizeId: number | undefined,
): number {
  const size = resolveSize(sizes, sizeId);
  return size ? parseFloat(size.price_delta) : 0;
}

/**
 * The lowest price the dish can be had at - base plus the cheapest size's delta,
 * floored at zero exactly as the server floors it.
 *
 * This is what a catalog card's "from" price must show: with a small size that
 * discounts the base, quoting the base alone names a price the customer can beat,
 * and quoting it as a "from" would be simply wrong.
 */
export function lowestPrice(basePrice: string, sizes: MenuSize[]): number {
  const base = parseFloat(basePrice);
  if (sizes.length === 0) return base;
  const cheapest = Math.min(...sizes.map((s) => parseFloat(s.price_delta)));
  return Math.max(0, base + cheapest);
}

/**
 * What the dish costs in **one specific size**: base plus that size's delta,
 * floored at zero exactly as the server floors it.
 *
 * This is what the size picker prints on each card. A signed delta ("+40") only
 * says what the size does to a number the customer has to find elsewhere on the
 * page and add up themselves; the price of the pizza in that size is the figure
 * they are actually choosing between. Add-ons are deliberately not folded in -
 * the cards compare sizes, and the configured total is printed once, below.
 *
 * Display only, like every other figure here.
 */
export function priceForSize(basePrice: string, size: MenuSize): number {
  return Math.max(0, parseFloat(basePrice) + parseFloat(size.price_delta));
}

/** True when the dish offers a real choice of size - one size is not a choice,
 *  and rendering a single locked chip for it is noise. */
export function hasSizeChoice(sizes: MenuSize[]): boolean {
  return sizes.length > 1;
}

/** Per-ingredient chosen quantity, keyed by `MenuItemIngredient.id`. */
export type SelectionQuantities = Record<number, number>;

/** Per-ingredient chosen alternative (an `Ingredient` id), keyed the same way.
 *  An absent entry means the group's own default choice. */
export type SelectionOptions = Record<number, number>;

/**
 * The ingredients that are live on the item at all.
 *
 * A disabled row is an admin's "not right now" - it stays on the menu item so
 * the recipe is not lost, but no customer-facing surface may show it. Lives here
 * rather than beside the detail page's components because the card's customiser
 * is a client component and cannot import from a server one.
 */
export function enabledIngredients(
  ingredients: MenuItemIngredient[],
): MenuItemIngredient[] {
  return ingredients.filter((ing) => ing.enabled);
}

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

/**
 * What the configured dish costs: base + the chosen size's delta + every add-on
 * up-charge, floored at zero.
 *
 * The one figure all three customising surfaces print, mirroring the server's
 * `price_for_selection` term for term. Note what it does **not** do: the size
 * does not scale the add-on up-charges. Extra cheese costs the same on a small
 * as on a large - one pricing axis, deliberately, because a multiplier would have
 * to be applied identically here, in the till and in Django, and the first
 * disagreement between them is a price on screen that is not the price charged.
 *
 * Display only. The server re-prices every selection at checkout and its answer
 * is what is stored and charged.
 */
export function menuItemTotal(
  basePrice: string,
  sizes: MenuSize[],
  sizeId: number | undefined,
  ingredients: MenuItemIngredient[],
  quantities: SelectionQuantities,
  options: SelectionOptions,
): number {
  const total =
    parseFloat(basePrice) +
    sizeDelta(sizes, sizeId) +
    selectionUpcharge(ingredients, quantities, options);
  return Math.max(0, total);
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
