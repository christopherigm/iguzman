"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Toast } from "@repo/ui/core-elements/toast";
import type { IconButtonSize } from "@repo/ui/core-elements/icon-button";
import type { ButtonSize, ButtonKind } from "@repo/ui/core-elements/button";

interface AddToCartButtonProps {
  /**
   * `food` adds the menu item's base line - its default ingredients at the "from"
   * price - by posting an empty `customization`. Product/service add by variant.
   */
  kind: "product" | "service" | "food";
  /** The catalog item's id - not the CartItem row's. */
  id: number;
  /**
   * The variant being added, when the item has one. This is part of the line's
   * identity server-side, so a card that omits it and a detail page that sends
   * the selected one deliberately produce different lines. Ignored for `food`,
   * which has no variants.
   */
  variantId?: number | null;
  /**
   * The cart line for this exact item+variant, when it is already in the cart.
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
 * `cartLineId` is what decides which of the two this is, and it comes from the
 * server on every render - there is no local "in cart" state to drift. The add
 * half is not a toggle: clicking twice means "two of these", which the API turns
 * into a quantity bump rather than a second line. Remove is all-or-nothing by
 * contrast: it drops the line whatever its quantity, matching the cart page's
 * own remove button rather than decrementing.
 *
 * Neither half flips optimistically the way the heart next to it does, because
 * neither has local state that could stand in for the server's answer: the
 * button shows a pending state and confirms with a toast once the line actually
 * exists (or is gone). `router.refresh()` then re-runs the server components
 * that own the real state - which is what swaps this button's own icon and
 * updates the navbar's count.
 */
export function AddToCartButton({
  kind,
  id,
  variantId = null,
  cartLineId = null,
  isLoggedIn,
  disabled = false,
  display = "icon",
  buttonKind,
  size = "sm",
  stopPropagation = false,
  flex,
  minWidth,
}: AddToCartButtonProps) {
  const t = useTranslations("ItemDetail");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // `id` increments per click so the Toast remounts (and its timer restarts) on
  // a rapid second add, rather than the first one's timer expiring mid-animation.
  const [toast, setToast] = useState<{
    kind: ToastKind;
    id: number;
  } | null>(null);

  const showToast = (kind: ToastKind) =>
    setToast((previous) => ({ kind, id: (previous?.id ?? 0) + 1 }));

  const inCart = cartLineId !== null;

  const label = inCart ? t("removeFromCart") : t("addToCart");
  const icon = inCart ? "/icons/remove-from-cart.svg" : "/icons/add-to-cart.svg";

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!isLoggedIn) {
      router.push("/auth");
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
              // changes. Product/service post their variant.
              body: JSON.stringify(
                kind === "food"
                  ? { kind: "menu_item", id, customization: [], quantity: 1 }
                  : { kind, id, variant_id: variantId },
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
