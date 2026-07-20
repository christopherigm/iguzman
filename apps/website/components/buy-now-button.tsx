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
  /**
   * The variant to add, when the item has one. A past order line does not carry
   * a variant id (only a snapshot label), so "Buy again" omits it and re-adds
   * the base item; the detail pages pass the selected variant.
   */
  variantId?: number | null;
  isLoggedIn: boolean;
  disabled?: boolean;
  /** The localized label - the server passes "Buy now" / "Buy again". */
  text: string;
  size?: ButtonSize;
  flex?: string;
  minWidth?: number;
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
  variantId = null,
  isLoggedIn,
  disabled = false,
  text,
  size = "lg",
  flex,
  minWidth,
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
      addGuestCartLine({ kind, id, variant_id: variantId, quantity: 1 });
      router.push("/cart");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id, variant_id: variantId }),
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
        icon="/icons/happy-heart-eyes.svg"
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
