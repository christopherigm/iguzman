"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { PointsCalculatorModal } from "./points-calculator-modal";
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
  /** A menu item's ingredient rows, for the cost estimate. Omitted by products
   *  and services, which have no ingredients - the breakdown is then skipped
   *  and only the money fields and Stripe estimate render. */
  ingredients?: IngredientRow[];
  /** The tenant's reusable ingredient catalog (carries price + currency).
   *  Omitted alongside `ingredients`. */
  catalog?: IngredientOption[];
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
 * The "Pricing & Costs" section, rendered at the end of the product, service and
 * menu-item admin forms. It reorders the money fields into a cost-to-price
 * reading order (Currency → estimated ingredient cost → your cost → competitors
 * → your price) and keeps the Stripe payout estimate alongside them. The
 * price/compare/cost/currency values live in the parent form's `values`; this
 * component only renders and edits them.
 *
 * Menu items additionally pass `ingredients` + `catalog`, which adds the live
 * breakdown of the estimated ingredient cost above the money fields. Products
 * and services have no ingredients, so they omit both and that card is skipped.
 */
export function PricingSection({
  values,
  onChange,
  ingredients,
  catalog,
}: Props) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  const currency = String(values.currency ?? "USD") || "USD";

  // Only menu items cost out their ingredients; everything else renders the
  // money fields alone.
  const showIngredientsCost =
    ingredients !== undefined && catalog !== undefined;

  const cost = useMemo(
    () =>
      computeIngredientsCost(
        ingredients ?? [],
        catalog ?? [],
        currency,
        locale,
      ),
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

      {/* Ingredient cost breakdown table, above the money fields it informs.
          Menu items only - products and services have no ingredients. */}
      {showIngredientsCost && (
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

          {(cost.hasUnpriced ||
            cost.hasNotConvertible ||
            cost.mixedCurrency) && (
            <Typography variant="caption" color={MUTED}>
              {cost.mixedCurrency
                ? t("costMixedCurrencyNote")
                : t("costEstimateNote")}
            </Typography>
          )}
        </Card>
      )}

      {/* The money fields and the two points fields, in one card - the same
          bordered surface the ingredient-cost breakdown above and the Stripe
          payout estimate below sit on, so the whole section reads as a stack of
          panels rather than a card, a bare grid and another card.

          They are one card and not two because they are one decision: what this
          item costs to make, what it sells for, and what that price is worth in
          points are read down the card in that order. The hairline is the only
          thing between them. */}
      <Card gap="16px">
        {/* Money, in cost-to-price reading order. */}
        <Box
          display="grid"
          gap="16px"
          alignItems="start"
          styles={{
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          <Select
            label={t("currency")}
            value={currency}
            onChange={(v) => onChange("currency", v)}
            options={CURRENCY_OPTIONS}
          />
          {showIngredientsCost && (
            <TextInput
              label={t("ingredientsCost")}
              value={fmt(cost.total)}
              disabled
            />
          )}
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

        {/* Rewards, under the money fields it sits beside on the storefront card
            ("MX$120 / 1200 points").

            ⚠ **Both are blank-means-something, and the two meanings differ.** A
            blank *award* inherits the item's category, so clearing it is how a
            dish is handed back to the family rate - which is why the hint says
            so rather than the field defaulting to 0. A blank *points price*
            means the item cannot be bought with points at all, which is every
            item's starting state; there is deliberately no category-level points
            price to inherit, because that number has to be weighed against this
            one item's own money price.

            ⚠ **Zero is not blank on the award.** An item set to 0 earns nothing
            however generous its category is - that is how a loss-leader is taken
            out of a family that earns - so the form must send `null` for an
            empty box and never coerce it. Each item form's `handleSubmit` lists
            both keys in its blank-to-null sweep for exactly this reason.

            Rendered whatever the tenant's global switch says: these are catalog
            numbers, and a tenant setting the program up will fill them in before
            going live. The switch on /admin/system is the only thing that
            decides whether any of it is read. */}
        <Box
          flexDirection="column"
          gap="12px"
          paddingTop={14}
          styles={{ borderTop: `1px solid ${HAIRLINE}` }}
        >
          {/* The calculator's button sits above the pair it fills in, not below
              it: an operator who does not know what to type has to meet the
              offer of help before the two empty boxes, not after them. It is
              `type="button"` because this section renders inside each item
              form's `<form>`, and the default would submit the page. */}
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            gap="12px"
          >
            <Typography as="span" variant="body" fontWeight={700}>
              {t("rewardsTitle")}
            </Typography>
            <Button
              text={t("pointsCalcOpen")}
              kind="primary"
              size="sm"
              type="button"
              onClick={() => setCalculatorOpen(true)}
            />
          </Box>

          <Box
            display="grid"
            gap="16px"
            alignItems="start"
            styles={{
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            }}
          >
            <TextInput
              label={t("pointsAward")}
              format="number"
              value={String(values.points_award ?? "")}
              onChange={(v) => onChange("points_award", v)}
              helperText={t("pointsAwardHint")}
            />
            <TextInput
              label={t("pointsPrice")}
              format="number"
              value={String(values.points_price ?? "")}
              onChange={(v) => onChange("points_price", v)}
              helperText={t("pointsPriceHint")}
            />
          </Box>
        </Box>
      </Card>

      {/* The calculator. It writes the selling price too, since that is the
          number it works everything else out from and an operator may well have
          typed it here rather than above. */}
      {calculatorOpen && (
        <PointsCalculatorModal
          price={values.price}
          costPrice={values.cost_price}
          currency={currency}
          onCancel={() => setCalculatorOpen(false)}
          onApply={({ price, pointsAward, pointsPrice }) => {
            onChange("price", price);
            onChange("points_award", String(pointsAward));
            onChange("points_price", String(pointsPrice));
            setCalculatorOpen(false);
          }}
        />
      )}

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
