"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { MenuItemIngredient } from "@/lib/catalog";

/**
 * Shared customisation state for a single menu item's detail page.
 *
 * The customiser (which the user drives) and the nutrition label (which must
 * mirror it) live in different rows of the page, so the selected quantity per
 * ingredient is lifted here and both read from it. `quantities` is keyed by
 * ingredient id and initialised to what the base already includes.
 */
interface MenuCustomizationValue {
  quantities: Record<number, number>;
  setQuantity: (id: number, quantity: number) => void;
}

const MenuCustomizationContext = createContext<MenuCustomizationValue | null>(
  null,
);

export function MenuCustomizationProvider({
  ingredients,
  children,
}: {
  ingredients: MenuItemIngredient[];
  children: ReactNode;
}) {
  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries(ingredients.map((i) => [i.id, i.default_units])),
  );

  const setQuantity = useCallback(
    (id: number, quantity: number) =>
      setQuantities((prev) => ({ ...prev, [id]: quantity })),
    [],
  );

  const value = useMemo(
    () => ({ quantities, setQuantity }),
    [quantities, setQuantity],
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
