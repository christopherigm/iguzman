"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { MenuItemIngredient, MenuSize } from "@/lib/catalog";
import { defaultSize } from "@/lib/menu-selection";

/**
 * Shared customisation state for a single menu item's detail page.
 *
 * The customiser (which the user drives) and the nutrition label (which must
 * mirror it) live in different rows of the page, so the chosen size, the selected
 * quantity per ingredient - and, for a single-select choice group, the chosen
 * option - are lifted here and both read from them. Both ingredient maps are
 * keyed by the ingredient *group* id: `quantities` starts at what the base
 * includes, `options` at each group's default option (its own ingredient id).
 */
interface MenuCustomizationValue {
  /** The chosen size's id, seeded from the dish's default. `undefined` only for a
   *  dish sold in one size, where there is nothing to choose. */
  sizeId: number | undefined;
  setSizeId: (id: number) => void;
  quantities: Record<number, number>;
  setQuantity: (id: number, quantity: number) => void;
  /** Group id -> chosen option's Ingredient id. */
  options: Record<number, number>;
  setOption: (id: number, ingredientId: number) => void;
}

const MenuCustomizationContext = createContext<MenuCustomizationValue | null>(
  null,
);

export function MenuCustomizationProvider({
  ingredients,
  sizes,
  children,
}: {
  ingredients: MenuItemIngredient[];
  /** The dish's effective sizes, as the API resolved them. Empty for a dish sold
   *  in one size. */
  sizes: MenuSize[];
  children: ReactNode;
}) {
  // Seeded from the dish's default rather than left blank: the page has to be
  // able to print a total before the customer touches anything, and that total
  // must be the one the server would charge for an untouched line.
  const [sizeId, setSizeId] = useState<number | undefined>(
    () => defaultSize(sizes)?.id,
  );
  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries(ingredients.map((i) => [i.id, i.default_units])),
  );
  // Each group starts on its default option (its own ingredient id).
  const [options, setOptions] = useState<Record<number, number>>(() =>
    Object.fromEntries(ingredients.map((i) => [i.id, i.ingredient])),
  );

  const setQuantity = useCallback(
    (id: number, quantity: number) =>
      setQuantities((prev) => ({ ...prev, [id]: quantity })),
    [],
  );

  const setOption = useCallback(
    (id: number, ingredientId: number) =>
      setOptions((prev) => ({ ...prev, [id]: ingredientId })),
    [],
  );

  const value = useMemo(
    () => ({ sizeId, setSizeId, quantities, setQuantity, options, setOption }),
    [sizeId, quantities, setQuantity, options, setOption],
  );

  return (
    <MenuCustomizationContext.Provider value={value}>
      {children}
    </MenuCustomizationContext.Provider>
  );
}

export function useMenuCustomization(): MenuCustomizationValue {
  const ctx = useContext(MenuCustomizationContext);
  if (!ctx) {
    throw new Error(
      "useMenuCustomization must be used within a MenuCustomizationProvider",
    );
  }
  return ctx;
}
