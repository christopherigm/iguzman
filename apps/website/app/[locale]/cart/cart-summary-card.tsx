"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { useTranslations } from "next-intl";
import type { CartTotal } from "@/lib/cart";
import { formatPrice } from "@/lib/price";
import { CheckoutButton } from "./checkout-button";

export interface CartSummaryCardProps {
  totals: CartTotal[];
  /** Total quantity, matching the navbar's count - not the number of lines. */
  count: number;
  /** Why checkout cannot run, or null when it can. */
  blockedReason: "unavailable" | "mixedCurrency" | null;
  /** Check out from localStorage rather than from the customer's rows. */
  isGuest: boolean;
}

/**
 * The order summary card: one subtotal per currency, then the checkout CTA.
 *
 * The rendering half of the summary, shared by the signed-in cart (whose server
 * component decides `blockedReason` before the first byte) and the guest cart
 * (which decides it on the client from the same two facts). Splitting it this
 * way is what keeps one design for both carts.
 *
 * Totals are grouped by currency rather than added together because
 * `Buyable.currency` is per item, so a System can hold a USD product and an MXN
 * one, and a single number across them would be arithmetic on incomparable
 * units. Most carts have exactly one row here. That grouping is also what
 * decides whether checkout can run at all: a Stripe Checkout Session is
 * single-currency, so more than one row here has no single total to charge.
 */
export function CartSummaryCard({
  totals,
  count,
  blockedReason,
  isGuest,
}: CartSummaryCardProps) {
  const t = useTranslations("Cart");

  return (
    <Card
      gap={14}
      backgroundColor="var(--surface-1)"
      elevation={3}
      border="none"
      styles={{
        position: "sticky",
        top: "calc(var(--ui-navbar-height, 57px) + 16px)",
      }}
    >
      <Typography as="h2" variant="h5" margin={0} color="var(--on-surface)">
        {t("summary")}
      </Typography>

      <Box height={1} flex="0 0 auto" backgroundColor="var(--border)" />

      <Box alignItems="center" justifyContent="space-between" gap={8}>
        <Typography as="span" variant="body" color="var(--foreground)">
          {t("itemCount", { count })}
        </Typography>
      </Box>

      {totals.map((total) => (
        <Box
          key={total.currency}
          alignItems="baseline"
          justifyContent="space-between"
          gap={8}
        >
          <Typography as="span" variant="body" color="var(--on-surface)">
            {t("subtotal")}
            {totals.length > 1 ? ` (${total.currency})` : ""}
          </Typography>
          <Typography
            as="span"
            variant="h5"
            fontWeight={700}
            margin={0}
            color="var(--on-surface)"
          >
            {formatPrice(total.subtotal, total.currency)}
          </Typography>
        </Box>
      ))}

      <Typography variant="caption" margin={0} color="var(--foreground)">
        {t("taxesNote")}
      </Typography>

      <CheckoutButton blockedReason={blockedReason} isGuest={isGuest} />

      {isGuest && (
        <Typography
          variant="caption"
          margin={0}
          color="var(--foreground)"
          styles={{ textAlign: "center" }}
        >
          {t("guestCheckoutNote")}
        </Typography>
      )}
    </Card>
  );
}
