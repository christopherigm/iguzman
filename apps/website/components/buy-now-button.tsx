"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Button } from "@repo/ui/core-elements/button";
import { Toast } from "@repo/ui/core-elements/toast";
import type { ButtonSize } from "@repo/ui/core-elements/button";
import { addGuestCartLine } from "@/lib/guest-cart";

interface BuyNowButtonProps {
  kind: "product" | "service";
  /** The catalog item's id - not the CartItem row's. */
  id: number;
  isLoggedIn: boolean;
  disabled?: boolean;
  /** The localized label - the server passes "Buy now" / "Buy again". */
  text: string;
  size?: ButtonSize;
  flex?: string;
  minWidth?: number;
  /**
   * How many to put in the cart before heading to checkout, from a stepper the
   * caller owns - the detail page's buy box, today. One write rather than N:
   * the cart merges an add into the line it already has, so posting three times
   * would be three round-trips for the same row. @default 1
   */
  quantity?: number;
}

/**
 * Adds one of the item to the cart and then sends the customer straight to
 * `/cart` to check out - the express path that sits beside `AddToCartButton` on
 * the detail pages, and the "Buy again" reorder button on a past order's lines.
 *
 * Unlike `AddToCartButton` this is never a toggle: it always adds (a POST the
 * API turns into a quantity bump when the line already exists) and then
 * navigates, so there is no in-cart/remove state to track. A failed add stays
 * put and shows an error toast rather than sending the customer to a cart the
 * item never reached.
 *
 * A logged-out visitor takes the same path into a localStorage cart rather than
 * being bounced to /auth: buying is what they came to do, and checkout no longer
 * needs an account.
 */
export function BuyNowButton({
  kind,
  id,
  isLoggedIn,
  disabled = false,
  text,
  size = "lg",
  flex,
  minWidth,
  quantity = 1,
}: BuyNowButtonProps) {
  const t = useTranslations("ItemDetail");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Bumped per failed click so the Toast remounts (its timer restarts) on a
  // rapid retry rather than the first one's timer expiring mid-animation.
  const [failed, setFailed] = useState(0);

  const handleClick = () => {
    if (!isLoggedIn) {
      // A guest buys the same way, straight into localStorage - the write is
      // synchronous, so there is nothing to await before navigating.
      addGuestCartLine({ kind, id, quantity });
      router.push("/cart");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id, quantity }),
        });

        if (!res.ok) {
          setFailed((n) => n + 1);
          return;
        }

        router.push("/cart");
      } catch {
        setFailed((n) => n + 1);
      }
    });
  };

  return (
    <>
      <Button
        text={text}
        kind="success"
        size={size}
        flex={flex}
        minWidth={minWidth}
        disabled={disabled || isPending}
        onClick={handleClick}
      />

      {failed > 0 && (
        <Toast
          key={failed}
          message={t("addToCartFailed")}
          variant="error"
          position="top-center"
          duration={3}
        />
      )}
    </>
  );
}
