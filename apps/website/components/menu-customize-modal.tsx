"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import type { MenuItemIngredient } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";
import {
  buildCustomization,
  customizableIngredients,
  selectionUpcharge,
  type SelectionOptions,
  type SelectionQuantities,
} from "@/lib/menu-selection";
import { addGuestCartLine } from "@/lib/guest-cart";
import { MenuIngredientPicker } from "./menu-ingredient-picker";

interface Props {
  menuItemId: number;
  /** The dish's name, already resolved to the reader's locale - the modal's title. */
  name: string;
  /** The item's own list price; add-on deltas are added on top for the OK label. */
  basePrice: string;
  currency: string;
  ingredients: MenuItemIngredient[];
  isLoggedIn: boolean;
  locale: string;
  /** Dismissed without adding. */
  onCancel: () => void;
  /** The line was written (or the write failed) - the caller owns the toast and,
   *  for a signed-in customer, the `router.refresh()` that re-reads the cart. */
  onResult: (ok: boolean) => void;
}

/**
 * The catalog card's add-to-cart step for a configurable dish.
 *
 * A food card used to post the base line straight from its icon button, which
 * silently chose the defaults for a customer who may well have wanted the dish
 * without onions - and gave them no hint the dish was configurable at all
 * without opening the detail page. So the card now asks first, with the same
 * rows the detail page and the POS till show (`MenuIngredientPicker`) and the
 * same arithmetic (`lib/menu-selection.ts`).
 *
 * Deliberately **one** dish per confirm: unlike the POS modal there is no
 * quantity stepper here, because the detail page's customiser adds one too and
 * the cart page is where a customer changes how many they want.
 *
 * As everywhere else, nothing here is trusted about money: the rows name
 * ingredients and quantities, and the server re-prices them.
 */
export function MenuCustomizeModal({
  menuItemId,
  name,
  basePrice,
  currency,
  ingredients,
  isLoggedIn,
  locale,
  onCancel,
  onResult,
}: Props) {
  const t = useTranslations("Menu");
  const tCommon = useTranslations("Common");
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(
    () => customizableIngredients(ingredients),
    [ingredients],
  );

  // Every group starts where the menu says it does; the customer only moves what
  // they want changed.
  const [quantities, setQuantities] = useState<SelectionQuantities>(() =>
    Object.fromEntries(visible.map((ing) => [ing.id, ing.default_units])),
  );
  const [options, setOptions] = useState<SelectionOptions>({});

  const total =
    parseFloat(basePrice) + selectionUpcharge(ingredients, quantities, options);

  const handleAdd = () => {
    const customization = buildCustomization(ingredients, quantities, options);

    // A guest's cart is localStorage: synchronous, with nothing to await and no
    // failure to report.
    if (!isLoggedIn) {
      addGuestCartLine({
        kind: "menu_item",
        id: menuItemId,
        customization,
        quantity: 1,
      });
      onResult(true);
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "menu_item",
            id: menuItemId,
            customization,
            quantity: 1,
          }),
        });
        onResult(res.ok);
      } catch {
        onResult(false);
      }
    });
  };

  return (
    <ConfirmationModal
      title={name}
      text={t("customize", { name })}
      panelMaxWidth="560px"
      okLabel={t("addToCartWithPrice", {
        price: formatPrice(total.toFixed(2), currency),
      })}
      cancelLabel={tCommon("cancel")}
      okDisabled={isPending}
      okCallback={handleAdd}
      cancelCallback={onCancel}
    >
      <MenuIngredientPicker
        ingredients={ingredients}
        quantities={quantities}
        options={options}
        onQuantityChange={(id, quantity) =>
          setQuantities((prev) => ({ ...prev, [id]: quantity }))
        }
        onOptionChange={(id, choiceId) =>
          setOptions((prev) => ({ ...prev, [id]: choiceId }))
        }
        currency={currency}
        locale={locale}
      />
    </ConfirmationModal>
  );
}
