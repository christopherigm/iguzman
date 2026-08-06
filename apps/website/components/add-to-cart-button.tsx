"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Toast } from "@repo/ui/core-elements/toast";
import type { IconButtonSize } from "@repo/ui/core-elements/icon-button";
import type { ButtonSize, ButtonKind } from "@repo/ui/core-elements/button";
import { useGuestState } from "@/hooks/use-guest-cart";
import type { MenuItemIngredient } from "@/lib/catalog";
import { customizableIngredients } from "@/lib/menu-selection";
import {
  addGuestCartLine,
  findGuestCartLine,
  removeGuestCartLine,
} from "@/lib/guest-cart";
import { MenuCustomizeModal } from "./menu-customize-modal";

/**
 * Everything the add-to-cart step needs to ask a customer how they want a dish
 * before it goes in the cart. Passed only for a `food` item that has add-ons;
 * without it (or with none) the button posts the base line as it always did.
 */
export interface AddToCartCustomization {
  /** The dish's name, already resolved to the reader's locale. */
  name: string;
  /** The item's own list price - the modal adds the selection's up-charge to it. */
  price: string;
  currency: string;
  /** The item's live ingredients (disabled rows already dropped by the caller). */
  ingredients: MenuItemIngredient[];
  locale: string;
}

interface AddToCartButtonProps {
  /**
   * `food` adds the menu item's base line - its default ingredients at the "from"
   * price - by posting an empty `customization`.
   */
  kind: "product" | "service" | "food";
  /** The catalog item's id - not the CartItem row's. */
  id: number;
  /**
   * The cart line for this exact item, when it is already in the cart.
   * Its presence flips the button to its remove state, and it is the row id the
   * delete addresses - the catalog id cannot name a line. Null/omitted means
   * "not in the cart", the plain add state.
   */
  cartLineId?: number | null;
  isLoggedIn: boolean;
  /**
   * Out of stock - the API would accept the line, but offering it is a lie.
   * Ignored in the remove state: taking an out-of-stock line back out of the
   * cart is exactly what a user should be able to do.
   */
  disabled?: boolean;
  /** `icon` on a card, `button` for a detail page's CTA. */
  display?: "icon" | "button";
  /**
   * Colour intent of the `button` display, passed through to `Button`'s own
   * `kind`. Named apart from this component's `kind` (product vs service) so the
   * two never read as the same thing. Ignored by the `icon` display, which is
   * the cards' warning-tinted circle, and in the remove state, which is always
   * `error` - the red is what tells the two states apart at a glance.
   */
  buttonKind?: ButtonKind;
  size?: IconButtonSize & ButtonSize;
  /**
   * Stop the click reaching an enclosing link. Set when the button sits on top
   * of a card that is itself a link, where a bare click would navigate to the
   * item instead of adding it.
   */
  stopPropagation?: boolean;
  /** Full-width CTA behaviour for the detail pages' action row. */
  flex?: string;
  minWidth?: number;
  /**
   * Turns the add half into "ask, then add" for a configurable dish: the click
   * opens `MenuCustomizeModal` instead of posting the defaults. Ignored in the
   * remove state, and ignored when the dish has no customer-facing add-ons.
   */
  customize?: AddToCartCustomization;
}

/** What the last click produced, and so which toast to show. */
type ToastKind = "added" | "removed" | "addFailed" | "removeFailed";

const TOAST_MESSAGES: Record<ToastKind, string> = {
  added: "addedToCart",
  removed: "removedFromCart",
  addFailed: "addToCartFailed",
  removeFailed: "removeFromCartFailed",
};

/**
 * Puts an item in the cart, or takes it back out when it is already there.
 *
 * Which of the two it is comes from wherever the cart actually lives: for a
 * customer that is `cartLineId`, re-read from the server on every render, so
 * there is no local "in cart" state to drift; for a guest it is the line's index
 * in localStorage, read through `useGuestState`. A guest's state is only known
 * after hydration, so a logged-out button settles into its real state a frame
 * late - the cost of a cart the server cannot see.
 *
 * The add half is not a toggle either way: clicking twice means "two of these",
 * which becomes a quantity bump rather than a second line. Remove is
 * all-or-nothing by contrast: it drops the line whatever its quantity, matching
 * the cart page's own remove button rather than decrementing.
 *
 * The signed-in half does not flip optimistically the way the heart next to it
 * does, because it has no local state that could stand in for the server's
 * answer: the button shows a pending state and confirms with a toast once the
 * line actually exists (or is gone). `router.refresh()` then re-runs the server
 * components that own the real state - which is what swaps this button's own
 * icon and updates the navbar's count. A guest write is synchronous and needs
 * neither.
 */
export function AddToCartButton({
  kind,
  id,
  cartLineId = null,
  isLoggedIn,
  disabled = false,
  display = "icon",
  buttonKind,
  size = "sm",
  stopPropagation = false,
  flex,
  minWidth,
  customize,
}: AddToCartButtonProps) {
  const t = useTranslations("ItemDetail");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [customizing, setCustomizing] = useState(false);
  // `id` increments per click so the Toast remounts (and its timer restarts) on
  // a rapid second add, rather than the first one's timer expiring mid-animation.
  const [toast, setToast] = useState<{
    kind: ToastKind;
    id: number;
  } | null>(null);
  const guest = useGuestState();

  const showToast = (kind: ToastKind) =>
    setToast((previous) => ({ kind, id: (previous?.id ?? 0) + 1 }));

  // The API knows a food item as `menu_item`; only this component's own prop
  // calls it `food`.
  const cartKind = kind === "food" ? "menu_item" : kind;

  // A guest line's handle is its index in localStorage, which -1 means "absent".
  const guestLine = findGuestCartLine(guest, cartKind, id);
  const inCart = isLoggedIn ? cartLineId !== null : guestLine !== -1;

  // A dish whose add-ons are all internal (kitchen-only) has nothing to ask
  // about, so it keeps the straight-to-cart click.
  const hasAddOns = useMemo(
    () => customizableIngredients(customize?.ingredients ?? []).length > 0,
    [customize?.ingredients],
  );
  const asksFirst = kind === "food" && !inCart && hasAddOns;

  const label = inCart ? t("removeFromCart") : t("addToCart");
  const icon = inCart
    ? "/icons/remove-from-cart.svg"
    : "/icons/add-to-cart.svg";

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }

    // A configurable dish is asked about rather than assumed; the modal owns the
    // write from here and reports back through `handleCustomizeResult`.
    if (asksFirst) {
      setCustomizing(true);
      return;
    }

    if (!isLoggedIn) {
      if (inCart) {
        removeGuestCartLine(guestLine);
        showToast("removed");
      } else {
        // Food adds its base line - the dish as listed, no ingredient changes.
        addGuestCartLine({
          kind: cartKind,
          id,
          ...(cartKind === "menu_item" ? { customization: [] } : {}),
          quantity: 1,
        });
        showToast("added");
      }
      return;
    }

    startTransition(async () => {
      try {
        const res = inCart
          ? await fetch(`/api/auth/cart/${cartLineId}`, { method: "DELETE" })
          : await fetch("/api/auth/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Food posts the base line: kind `menu_item` with no ingredient
            // changes.
            body: JSON.stringify(
              kind === "food"
                ? { kind: "menu_item", id, customization: [], quantity: 1 }
                : { kind, id },
            ),
          });

        if (!res.ok) {
          showToast(inCart ? "removeFailed" : "addFailed");
          return;
        }

        showToast(inCart ? "removed" : "added");
        router.refresh();
      } catch {
        showToast(inCart ? "removeFailed" : "addFailed");
      }
    });
  };

  // The modal wrote the line (or failed to); the toast and the re-read of the
  // server's cart state stay here, where every other outcome is reported.
  const handleCustomizeResult = (ok: boolean) => {
    setCustomizing(false);
    showToast(ok ? "added" : "addFailed");
    if (ok && isLoggedIn) router.refresh();
  };

  return (
    <>
      {display === "icon" ? (
        <IconButton
          icon={icon}
          aria-label={label}
          title={label}
          kind={inCart ? "error" : "warning"}
          size={size}
          disabled={(disabled && !inCart) || isPending}
          onClick={handleClick}
        />
      ) : (
        <Button
          text={label}
          icon={icon}
          kind={inCart ? "error" : buttonKind}
          size={size}
          flex={flex}
          minWidth={minWidth}
          disabled={(disabled && !inCart) || isPending}
          onClick={handleClick}
        />
      )}

      {customizing && customize && (
        <MenuCustomizeModal
          menuItemId={id}
          name={customize.name}
          basePrice={customize.price}
          currency={customize.currency}
          ingredients={customize.ingredients}
          isLoggedIn={isLoggedIn}
          locale={customize.locale}
          onCancel={() => setCustomizing(false)}
          onResult={handleCustomizeResult}
        />
      )}

      {toast && (
        <Toast
          key={toast.id}
          message={t(TOAST_MESSAGES[toast.kind])}
          variant={
            toast.kind === "added" || toast.kind === "removed"
              ? "success"
              : "error"
          }
          position="top-center"
          duration={3}
        />
      )}
    </>
  );
}
