"use client";

import { useLocale, useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";

// Stripe's standard domestic-card rates per settlement currency, taken from
// stripe.com/pricing. This is an informational estimate only: a tenant's real
// fee depends on their Stripe account country and the card the customer uses
// (international / cross-border cards cost more), so we key off the item's
// currency as the best proxy we have here and fall back to the US rate.
const STRIPE_RATES: Record<string, { percent: number; fixed: number }> = {
  USD: { percent: 2.9, fixed: 0.3 },
  EUR: { percent: 1.5, fixed: 0.25 },
  GBP: { percent: 1.5, fixed: 0.2 },
  CAD: { percent: 2.9, fixed: 0.3 },
  MXN: { percent: 3.6, fixed: 3 },
  BRL: { percent: 3.99, fixed: 0.39 },
  CLP: { percent: 3.6, fixed: 0 },
};
const DEFAULT_RATE = { percent: 2.9, fixed: 0.3 };

const MUTED = "color-mix(in srgb, var(--foreground) 65%, transparent)";
const HAIRLINE = "color-mix(in srgb, var(--foreground) 12%, transparent)";
const POSITIVE = "#16a34a";
const NEGATIVE = "#dc2626";

function Row({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={16}
    >
      <Typography as="span" variant="body" color={MUTED}>
        {label}
      </Typography>
      <Typography
        as="span"
        variant="body"
        fontWeight={bold ? 700 : 500}
        color={valueColor ?? "var(--foreground)"}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Read-only estimate of the Stripe payout for a priced record, shown directly
 * below the cost-price / currency fields on the product, service and menu-item
 * admin forms. It never touches the tenant's Stripe configuration - it renders
 * whether or not a Stripe account is connected, purely to help the operator
 * price against Stripe's cut. When a cost price is set it also shows the
 * estimated profit (payout minus cost).
 */
export function StripeNetEstimate({
  price,
  currency,
  costPrice,
  bare,
}: {
  price: unknown;
  currency: unknown;
  costPrice: unknown;
  /**
   * Render without the component's own bordered container - for when it sits
   * inside a `Card` (or similar) that already provides the surface. The header
   * and rows are unchanged; only the outer frame is dropped.
   */
  bare?: boolean;
}) {
  const t = useTranslations("Admin");
  const locale = useLocale();

  const currencyCode = String(currency ?? "USD").toUpperCase() || "USD";
  const rate = STRIPE_RATES[currencyCode] ?? DEFAULT_RATE;

  const fmt = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
    }).format(amount);

  const rateLabel =
    rate.fixed > 0
      ? `${rate.percent}% + ${fmt(rate.fixed)}`
      : `${rate.percent}%`;

  const priceNum = Number(String(price ?? "").trim());
  const hasPrice = Number.isFinite(priceNum) && priceNum > 0;

  const costRaw = String(costPrice ?? "").trim();
  const costNum = Number(costRaw);
  const hasCost = costRaw !== "" && Number.isFinite(costNum);

  const fee = hasPrice ? (priceNum * rate.percent) / 100 + rate.fixed : 0;
  const payout = priceNum - fee;
  const profit = payout - costNum;

  return (
    <Box
      flexDirection="column"
      gap={8}
      padding={bare ? undefined : "14px 16px"}
      borderRadius={bare ? undefined : 10}
      border={bare ? undefined : `1px solid ${HAIRLINE}`}
      backgroundColor={
        bare ? undefined : "color-mix(in srgb, var(--foreground) 3%, transparent)"
      }
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
      >
        {bare ? (
          // Inside a Card: match the sibling cost card's h6 title treatment.
          <Typography variant="h6" margin={0}>
            {t("stripeNetTitle")}
          </Typography>
        ) : (
          <Typography
            variant="label"
            fontWeight={800}
            color="var(--foreground)"
            styles={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            {t("stripeNetTitle")}
          </Typography>
        )}
        <Typography as="span" variant="label" color={MUTED}>
          {rateLabel}
        </Typography>
      </Box>

      {!hasPrice ? (
        <Typography variant="caption" color={MUTED}>
          {t("stripeNetNoPrice")}
        </Typography>
      ) : (
        <>
          <Typography variant="caption" color={MUTED}>
            {t("stripeNetHint", { currency: currencyCode })}
          </Typography>

          <Box flexDirection="column" gap={6} marginTop={2}>
            <Row label={t("stripeNetSaleLabel")} value={fmt(priceNum)} />
            <Row
              label={t("stripeNetFeeLabel")}
              value={`−${fmt(fee)}`}
              valueColor={MUTED}
            />
            <Row
              label={t("stripeNetPayoutLabel")}
              value={fmt(payout)}
              bold
            />

            {hasCost && (
              <>
                <Box
                  height={1}
                  backgroundColor={HAIRLINE}
                  marginTop={4}
                  marginBottom={4}
                />
                <Row
                  label={t("stripeNetCostLabel")}
                  value={`−${fmt(costNum)}`}
                  valueColor={MUTED}
                />
                <Row
                  label={t("stripeNetProfitLabel")}
                  value={fmt(profit)}
                  valueColor={profit >= 0 ? POSITIVE : NEGATIVE}
                  bold
                />
              </>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
