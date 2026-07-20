"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { useGuestState } from "@/hooks/use-guest-cart";

interface CheckoutButtonProps {
  /**
   * Why checkout cannot run, or null when it can. Decided by the server (the
   * tenant's Stripe setup, the cart's currencies) so the button renders in its
   * real state in the first HTML rather than flickering after hydration.
   */
  blockedReason: "unavailable" | "mixedCurrency" | null;
  /**
   * Check out without an account, sending the localStorage cart along. The
   * resulting order has no owner and is reached only by the `public_id` in the
   * URL Stripe returns to.
   */
  isGuest: boolean;
}

/** Error codes website-api's CheckoutView returns, mapped to what we tell the user. */
const ERROR_MESSAGES: Record<string, string> = {
  PAYMENTS_UNAVAILABLE: "checkoutUnavailable",
  MIXED_CURRENCY: "checkoutMixedCurrency",
  OUT_OF_STOCK: "checkoutOutOfStock",
  CART_EMPTY: "empty",
};

/**
 * Sends the cart to checkout and follows Stripe's redirect.
 *
 * A signed-in checkout posts an almost-empty body: the amount, the items and the
 * currency are all read from the customer's rows server-side. A guest has no
 * rows, so their references travel in the body - but they still only name
 * *which* items, and Django re-prices every one of them from the catalog before
 * creating a session. A client that could name a price could name its own.
 *
 * There is no success state to render here - the browser leaves for Stripe and
 * comes back to `/orders/[id]`, so `loading` stays true until navigation.
 */
export function CheckoutButton({
  blockedReason,
  isGuest,
}: CheckoutButtonProps) {
  const t = useTranslations("Cart");
  const locale = useLocale();
  const guest = useGuestState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        isGuest ? "/api/guest/checkout" : "/api/auth/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isGuest ? { locale, cart: guest.cart } : { locale },
          ),
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setError(t(ERROR_MESSAGES[data.code ?? ""] ?? "checkoutError"));
        setLoading(false);
        return;
      }

      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
      // `loading` is intentionally left true: the page is navigating away, and
      // resetting it would flash an enabled button during the redirect.
    } catch {
      setError(t("checkoutError"));
      setLoading(false);
    }
  }, [locale, t, isGuest, guest.cart]);

  const message = blockedReason
    ? blockedReason === "unavailable"
      ? t("checkoutUnavailable")
      : t("checkoutMixedCurrency")
    : error;

  return (
    <Box flexDirection="column" gap={8} width="100%">
      <Button
        text={loading ? t("checkoutRedirecting") : t("checkout")}
        kind="primary"
        size="lg"
        width="100%"
        disabled={loading || blockedReason !== null}
        onClick={handleCheckout}
      />
      {message ? (
        <Typography
          variant="caption"
          margin={0}
          color={error ? "var(--error, #ef4444)" : "var(--foreground)"}
          styles={{ textAlign: "center" }}
          aria-live="polite"
        >
          {message}
        </Typography>
      ) : (
        <Typography
          variant="caption"
          margin={0}
          color="var(--foreground)"
          styles={{ textAlign: "center" }}
        >
          {t("checkoutSecureNote")}
        </Typography>
      )}
    </Box>
  );
}
