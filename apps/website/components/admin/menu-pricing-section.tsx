"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { StripeNetEstimate } from "./stripe-net-estimate";
import { computeIngredientsCost } from "@/lib/ingredient-cost";
import type {
  IngredientRow,
  IngredientOption,
} from "./menu-ingredients-editor";

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "MXN", label: "MXN" },
  { value: "GBP", label: "GBP" },
  { value: "CAD", label: "CAD" },
  { value: "CLP", label: "CLP" },
  { value: "BRL", label: "BRL" },
];

const MUTED = "color-mix(in srgb, var(--foreground) 65%, transparent)";
const HAIRLINE = "color-mix(in srgb, var(--foreground) 12%, transparent)";

interface Props {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** The menu item's ingredient rows, for the cost estimate. */
  ingredients: IngredientRow[];
  /** The tenant's reusable ingredient catalog (carries price + currency). */
  catalog: IngredientOption[];
}

/** A right-aligned numeric cell (formatted amount, or a muted em dash). */
function NumCell({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <Box styles={{ textAlign: "right" }}>
      <Typography as="span" variant="body" color={muted ? MUTED : undefined}>
        {text}
      </Typography>
    </Box>
  );
}

/**
 * The menu item's "Pricing & Costs" section, rendered at the end of the admin
 * form. It reorders the money fields into a cost-to-price reading order
 * (Currency → estimated ingredient cost → your cost → competitors → your price),
 * shows a live breakdown of the estimated ingredient cost, and keeps the Stripe
 * payout estimate alongside them. The price/compare/cost/currency values live in
 * the parent form's `values`; this component only renders and edits them.
 */
export function MenuPricingSection({
  values,
  onChange,
  ingredients,
  catalog,
}: Props) {
  const t = useTranslations("Admin");
  const locale = useLocale();

  const currency = String(values.currency ?? "USD") || "USD";

  const cost = useMemo(
    () => computeIngredientsCost(ingredients, catalog, currency, locale),
    [ingredients, catalog, currency, locale],
  );

  const fmt = (amount: number) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      }).format(amount);
    } catch {
      return amount.toFixed(2);
    }
  };

  /** Bare number for the table cells - the currency lives in the total. */
  const num = (amount: number) => {
    try {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return amount.toFixed(2);
    }
  };

  const cellText = (value: number | null) =>
    value === null ? "—" : num(value);

  return (
    <Box display="flex" flexDirection="column" gap="20px">
      {/* Section header, matching the pair-group headers in admin-form.tsx. */}
      <Box
        paddingTop={12}
        paddingBottom={2}
        styles={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <Typography
          variant="label"
          fontWeight={800}
          color="var(--foreground)"
          styles={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          {t("pricingCostsSection")}
        </Typography>
      </Box>

      {/* Ingredient cost breakdown table, above the money fields it informs. */}
      <Card gap="12px">
        <Box display="flex" flexDirection="column" gap="4px">
          <Typography variant="h6" margin={0}>
            {t("ingredientsCost")}
          </Typography>
          <Typography variant="caption" color={MUTED}>
            {t("ingredientsCostHint")}
          </Typography>
        </Box>

        {cost.lines.length === 0 ? (
          <Typography variant="caption" color={MUTED}>
            {t("noIngredientsCost")}
          </Typography>
        ) : (
          <Box
            display="grid"
            alignItems="center"
            styles={{
              gridTemplateColumns: "minmax(0, 1.6fr) auto auto auto",
              columnGap: "10px",
              rowGap: "8px",
            }}
          >
            {/* Header row. */}
            <Typography as="span" variant="label" color={MUTED}>
              {t("ingredient")}
            </Typography>
            <Box styles={{ textAlign: "right" }}>
              <Typography as="span" variant="label" color={MUTED}>
                {t("costServed")}
              </Typography>
            </Box>
            <Box styles={{ textAlign: "right" }}>
              <Typography as="span" variant="label" color={MUTED}>
                {t("unitCost")}
              </Typography>
            </Box>
            <Box styles={{ textAlign: "right" }}>
              <Typography as="span" variant="label" color={MUTED}>
                {t("lineCost")}
              </Typography>
            </Box>

            {cost.lines.map((line) => (
              <Box key={line.key} styles={{ display: "contents" }} role="row">
                <Box
                  display="flex"
                  flexDirection="column"
                  styles={{ minWidth: 0, overflowWrap: "anywhere" }}
                >
                  <Typography as="span" variant="body">
                    {line.name}
                  </Typography>
                  <Typography as="span" variant="caption" color={MUTED}>
                    {line.portionLabel ??
                      (line.unpriced
                        ? t("costUnpriced")
                        : line.notConvertible
                          ? t("costNotConvertible")
                          : "—")}
                  </Typography>
                </Box>
                <NumCell text={String(line.servedUnits)} muted />
                <NumCell
                  text={cellText(line.unitCost)}
                  muted={line.unitCost === null}
                />
                <NumCell
                  text={cellText(line.lineCost)}
                  muted={line.lineCost === null}
                />
              </Box>
            ))}
          </Box>
        )}

        {/* Total. */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap="16px"
          paddingTop={10}
          styles={{ borderTop: `1px solid ${HAIRLINE}` }}
        >
          <Typography as="span" variant="body" fontWeight={700}>
            {t("costTotal")}
          </Typography>
          <Typography as="span" variant="body" fontWeight={700}>
            {fmt(cost.total)}
          </Typography>
        </Box>

        {(cost.hasUnpriced || cost.hasNotConvertible || cost.mixedCurrency) && (
          <Typography variant="caption" color={MUTED}>
            {cost.mixedCurrency
              ? t("costMixedCurrencyNote")
              : t("costEstimateNote")}
          </Typography>
        )}
      </Card>

      {/* Money fields, in cost-to-price reading order. */}
      <Box
        display="grid"
        gap="16px"
        alignItems="start"
        styles={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
      >
        <Select
          label={t("currency")}
          value={currency}
          onChange={(v) => onChange("currency", v)}
          options={CURRENCY_OPTIONS}
        />
        <TextInput
          label={t("ingredientsCost")}
          value={fmt(cost.total)}
          disabled
        />
        <TextInput
          label={t("costPrice")}
          format="number"
          value={String(values.cost_price ?? "")}
          onChange={(v) => onChange("cost_price", v)}
        />
        <TextInput
          label={t("competitorsPrice")}
          format="number"
          value={String(values.compare_price ?? "")}
          onChange={(v) => onChange("compare_price", v)}
        />
        <TextInput
          label={t("sellingPrice")}
          format="number"
          value={String(values.price ?? "")}
          onChange={(v) => onChange("price", v)}
        />
      </Box>

      {/* Stripe payout estimate, rendered as a card to match the cost card. */}
      <Card>
        <StripeNetEstimate
          price={values.price}
          currency={values.currency}
          costPrice={values.cost_price}
          bare
        />
      </Card>
    </Box>
  );
}
