"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Box } from "@repo/ui/core-elements/box";
import type { MenuItemIngredient, MenuSize } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";
import {
  buildCustomization,
  customizableIngredients,
  defaultSize,
  hasSizeChoice,
  menuItemTotal,
  type CustomizationRow,
  type SelectionOptions,
  type SelectionQuantities,
} from "@/lib/menu-selection";
import { addGuestCartLine } from "@/lib/guest-cart";
import { MENU_CUSTOMIZER_GAP } from "./menu-customizer-spacing";
import { MenuIngredientPicker } from "./menu-ingredient-picker";
import { MenuSizePicker } from "./menu-size-picker";

/**
 * The line being re-configured, when this modal is opened from the cart rather
 * than from a card.
 *
 * `customization` is the selection as `buildCustomization` emits it - only what
 * differs from the dish as listed - which is also exactly what the API stores
 * and hands back, so a cart line's rows drop straight in here.
 */
export interface MenuCustomizeEditing {
  /** The chosen size (a `MenuSize` id), null for a dish sold in one size. */
  size: number | null;
  customization: CustomizationRow[];
  /**
   * Persist the new selection, resolving to whether it stuck. Owned by the
   * caller for the same reason `CartLine`'s writes are: a customer's line is a
   * row behind `/api/auth/cart/[id]`, a guest's is an index in localStorage.
   */
  onSave: (selection: {
    size?: number;
    customization: CustomizationRow[];
  }) => Promise<boolean>;
}

interface Props {
  menuItemId: number;
  /** The dish's name, already resolved to the reader's locale - it names the
   *  dish in the modal's title ("Customize your <name>"). */
  name: string;
  /** The item's own list price; the chosen size's delta and the add-on deltas are
   *  applied on top for the OK label. */
  basePrice: string;
  currency: string;
  ingredients: MenuItemIngredient[];
  /** The dish's effective sizes, as the API resolved them. Empty for a dish sold
   *  in one size. */
  sizes: MenuSize[];
  isLoggedIn: boolean;
  locale: string;
  /**
   * Set when the modal is **editing** a line already in the cart instead of
   * adding a new one: the pickers open on that line's selection, OK saves it
   * through the caller's own write, and `isLoggedIn` is not consulted.
   */
  editing?: MenuCustomizeEditing;
  /** Dismissed without adding. */
  onCancel: () => void;
  /** The line was written (or the write failed) - the caller owns the toast and,
   *  for a signed-in customer, the `router.refresh()` that re-reads the cart. */
  onResult: (ok: boolean) => void;
}

/**
 * The catalog card's add-to-cart step for a configurable dish - and, with
 * `editing`, the cart page's "change my mind" step for one already in it.
 *
 * A food card used to post the base line straight from its icon button, which
 * silently chose the defaults for a customer who may well have wanted the dish
 * without onions - and gave them no hint the dish was configurable at all
 * without opening the detail page. So the card now asks first, with the same
 * controls the detail page and the POS till show (`MenuSizePicker` above
 * `MenuIngredientPicker`) and the same arithmetic (`lib/menu-selection.ts`).
 *
 * A dish sold in **several sizes** therefore always opens this modal even with no
 * add-ons at all: a card that quietly added the default size would be choosing
 * the pizza's diameter on the customer's behalf, at a price they never saw.
 *
 * Deliberately **one** dish per confirm: unlike the POS modal there is no
 * quantity stepper here, because the detail page's customiser adds one too and
 * the cart page is where a customer changes how many they want. That holds while
 * editing too - the row's own stepper is right behind the modal, and a second
 * one inside it could only disagree with it.
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
  sizes,
  isLoggedIn,
  locale,
  editing,
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

  // Adding: every group starts where the menu says it does and the customer only
  // moves what they want changed. Editing: it starts where *their line* is, since
  // the modal opens over a dish they already configured - anything else would ask
  // them to re-make every choice to change one of them. The stored selection
  // carries only the rows that differ, so the rest still fall back to the menu's.
  const edited = useMemo(
    () =>
      new Map(
        (editing?.customization ?? []).map((row) => [row.ingredient, row]),
      ),
    [editing],
  );
  const [quantities, setQuantities] = useState<SelectionQuantities>(() =>
    Object.fromEntries(
      visible.map((ing) => [
        ing.id,
        edited.get(ing.id)?.quantity ?? ing.default_units,
      ]),
    ),
  );
  const [options, setOptions] = useState<SelectionOptions>(() =>
    Object.fromEntries(
      visible
        .map((ing) => [ing.id, edited.get(ing.id)?.option] as const)
        .filter(
          (entry): entry is readonly [number, number] => entry[1] != null,
        ),
    ),
  );
  // Seeded from the line's size, else the dish's default, so the OK label names a
  // real price before the customer touches anything.
  const [sizeId, setSizeId] = useState<number | undefined>(
    () => editing?.size ?? defaultSize(sizes)?.id,
  );

  const total = menuItemTotal(
    basePrice,
    sizes,
    sizeId,
    ingredients,
    quantities,
    options,
  );

  const handleConfirm = () => {
    const customization = buildCustomization(ingredients, quantities, options);

    // Editing an existing line: the caller owns the write, because the same
    // change is a PATCH on a row for a signed-in customer and a localStorage
    // splice for a guest. The line's quantity is not ours to touch.
    if (editing) {
      startTransition(async () => {
        onResult(await editing.onSave({ size: sizeId, customization }));
      });
      return;
    }

    // A guest's cart is localStorage: synchronous, with nothing to await and no
    // failure to report.
    if (!isLoggedIn) {
      addGuestCartLine({
        kind: "menu_item",
        id: menuItemId,
        size: sizeId,
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
            size: sizeId,
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
      // The dish's name alone said what the customer was already looking at;
      // the instruction is what the dialog is for, so it is the heading and the
      // body text below it would only repeat it.
      title={t("customize", { name })}
      text=""
      panelMaxWidth="560px"
      okLabel={t(editing ? "saveChangesWithPrice" : "addToCartWithPrice", {
        price: formatPrice(total.toFixed(2), currency),
      })}
      cancelLabel={tCommon("cancel")}
      okDisabled={isPending}
      okCallback={handleConfirm}
      cancelCallback={onCancel}
    >
      {/* The size choice and the add-ons, held apart by the shared
          `MENU_CUSTOMIZER_GAP` - the modal's children arrive in a plain block,
          so without this column the add-on list sat straight against the size
          cards. */}
      <Box flexDirection="column" gap={MENU_CUSTOMIZER_GAP}>
        {/* Size first: it is what the customer is choosing between, and it moves
            the base the add-ons below are added to. */}
        {hasSizeChoice(sizes) && (
          <MenuSizePicker
            sizes={sizes}
            basePrice={basePrice}
            value={sizeId}
            onChange={setSizeId}
            currency={currency}
            locale={locale}
          />
        )}

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
      </Box>
    </ConfirmationModal>
  );
}
