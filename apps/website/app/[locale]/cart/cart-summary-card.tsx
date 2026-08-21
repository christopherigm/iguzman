"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { useTranslations } from "next-intl";
import type { CartRewards, CartTotal } from "@/lib/cart";
import { formatPrice } from "@/lib/price";
import { CheckoutSection, type AvailableMethods } from "./checkout-section";

export interface CartSummaryCardProps {
  totals: CartTotal[];
  /** Total quantity, matching the navbar's count - not the number of lines. */
  count: number;
  /** Which payment methods this tenant offers, each on its own tenant switch. */
  methods: AvailableMethods;
  /** The cart spans more than one currency, so no method can charge it. */
  mixedCurrency: boolean;
  /** The basket's points position, resolved by the API over every line at once. */
  rewards: CartRewards;
  /** Check out from localStorage rather than from the customer's rows. */
  isGuest: boolean;
}

/**
 * The order summary card: one subtotal per currency, then the checkout CTA.
 *
 * The rendering half of the summary, shared by the signed-in cart (whose server
 * component resolves the available payment `methods` before the first byte) and
 * the guest cart (which reads the same server-sent flags). Splitting it this way
 * is what keeps one design for both carts.
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
  methods,
  mixedCurrency,
  rewards,
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

      {/* What the points covered, and what is left in the balance.

          ⚠ **A statement, not a deduction.** `totals` above already excludes
          every redeemed line - it is what checkout will actually charge - so
          this row is saying "and 1200 points covered MX$120 of what you put in
          the basket", never "subtract this next". Subtracting it again is the
          one arithmetic mistake this block invites, which is why it prints as a
          plain figure rather than a signed one. */}
      {rewards.enabled && rewards.points_used > 0 && (
        <Box alignItems="baseline" justifyContent="space-between" gap={8}>
          <Typography as="span" variant="body" color="var(--foreground)">
            {t("paidWithPoints", { points: rewards.points_used })}
          </Typography>
          <Typography as="span" variant="body" color="var(--accent-text)">
            {formatPrice(rewards.points_value, totals[0]?.currency ?? "USD")}
          </Typography>
        </Box>
      )}

      {rewards.enabled && (
        <Typography variant="caption" margin={0} color="var(--foreground)">
          {t("pointsBalance", {
            points: rewards.balance - rewards.points_used,
          })}
        </Typography>
      )}

      <Typography variant="caption" margin={0} color="var(--foreground)">
        {t("taxesNote")}
      </Typography>

      <CheckoutSection
        methods={methods}
        mixedCurrency={mixedCurrency}
        isGuest={isGuest}
      />

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
