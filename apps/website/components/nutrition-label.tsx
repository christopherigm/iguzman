"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import type { MenuItemIngredient } from "@/lib/catalog";
import { nutritionRows } from "@/lib/nutrition";
import { useMenuCustomization } from "./menu-customization-context";

/** Reference daily energy intake used to express the total as a % daily value. */
const DAILY_CALORIES = 2000;

/**
 * The heavy black rules that give the FDA "Nutrition Facts" label its identity.
 * Rendered with `var(--foreground)` so they stay near-black on light and
 * near-white on dark - the strong body-vs-background contrast is preserved in
 * either theme. `hairline` separates rows; `medium`/`thick` divide sections.
 */
const HAIRLINE = "1px solid var(--foreground)";
const RULE_MEDIUM = 4;
const RULE_THICK = 8;

/** Portion as "<qty> <unit>", rounded to at most one decimal so a per-serving
 *  division (e.g. 100 g ÷ 3) doesn't print a long fraction. */
function formatPortion(quantity: number, unit: string): string {
  const rounded = Math.round(quantity * 10) / 10;
  const value = Number.isFinite(rounded) ? String(rounded) : quantity;
  return `${value} ${unit}`;
}

interface NutritionLabelProps {
  ingredients: MenuItemIngredient[];
  locale: string;
  /** Servings the dish yields; figures below are divided by it. Null/0 = 1. */
  portions: number | null;
}

/**
 * A menu item's calorie breakdown styled after the FDA "Nutrition Facts" panel:
 * a bold title, the total calories as the headline figure, then one hairline-
 * separated row per contributing ingredient showing its portion, calories, and
 * share of the total. Monochrome and square-cornered to read as the classic
 * label; the heavy rules track `--foreground` so it works in light and dark.
 *
 * The figures are **live**: each ingredient's contribution scales with the
 * quantity the customer has chosen in the customiser (shared via
 * `MenuCustomizationProvider`), so `calories` is per selected unit. Only the
 * ingredients currently in the order (selected quantity > 0) are listed, and the
 * total/percentages recompute as the selection changes. Every figure is then
 * divided by `portions` (the servings the dish yields) so the label reads *per
 * serving*, with an "N servings per item" line above it. Returns null when
 * nothing is selected that carries chartable data - callers should still gate on
 * `nutritionRows` before reserving layout space for it.
 */
export function NutritionLabel({
  ingredients,
  locale,
  portions,
}: NutritionLabelProps) {
  const t = useTranslations("Menu");
  const { quantities } = useMenuCustomization();

  // Every figure on the label is stated *per serving*: the whole-dish totals are
  // divided by how many servings the dish yields (1 when unset).
  const servings = portions && portions > 0 ? portions : 1;

  // Each chartable ingredient's contribution scales with the selected quantity;
  // only the ones actually in the order (qty > 0) are charted.
  const rows = useMemo(() => {
    return nutritionRows(ingredients)
      .map((ing) => {
        const qty = quantities[ing.id] ?? ing.included_units;
        return { ing, qty, calories: (ing.calories ?? 0) * qty };
      })
      .filter((r) => r.qty > 0 && r.calories > 0);
  }, [ingredients, quantities]);

  const total = rows.reduce((sum, r) => sum + r.calories, 0);
  if (rows.length === 0 || total === 0) return null;

  // The whole-dish total split across its servings, and its % of a 2000 kcal day.
  const perServingTotal = total / servings;
  const dailyValue = Math.round((perServingTotal / DAILY_CALORIES) * 100);

  return (
    <Card
      gap={0}
      padding={12}
      borderRadius={0}
      border="2px solid var(--foreground)"
      elevation={0}
      backgroundColor="var(--background)"
      color="var(--foreground)"
    >
      {/* Masthead: the label title, underlined by a thin rule. */}
      <Typography
        as="h2"
        variant="h2"
        fontWeight={800}
        color="var(--foreground)"
        paddingBottom={4}
        styles={{ lineHeight: 1.05, letterSpacing: "-0.01em" }}
      >
        {t("nutritionFacts")}
      </Typography>

      {/* "N servings per item", when the dish declares a serving count. */}
      {portions != null && portions > 0 && (
        <Typography
          variant="caption"
          color="var(--foreground)"
          paddingBottom={2}
        >
          {t("servingsPerItem", { value: servings })}
        </Typography>
      )}

      {/* Thick divider before "Amount Per Serving". */}
      <Box
        height={RULE_THICK}
        backgroundColor="var(--foreground)"
        marginTop={2}
      />

      <Typography
        variant="caption"
        fontWeight={700}
        color="var(--foreground)"
        paddingY={4}
      >
        {t("amountPerServing")}
      </Typography>

      {/* Headline figure: total calories, in the label's largest weight. */}
      <Box
        alignItems="baseline"
        justifyContent="space-between"
        gap={8}
        paddingBottom={4}
        styles={{ borderTop: HAIRLINE }}
        paddingTop={4}
      >
        <Typography variant="h4" fontWeight={800} color="var(--foreground)">
          {t("calories")}
        </Typography>
        <Typography variant="h3" fontWeight={800} color="var(--foreground)">
          {Math.round(perServingTotal)}
        </Typography>
      </Box>

      {/* Thick divider, then the right-aligned "% of total" column header. */}
      <Box height={RULE_MEDIUM} backgroundColor="var(--foreground)" />
      <Typography
        variant="label"
        fontWeight={700}
        color="var(--foreground)"
        textAlign="right"
        paddingY={3}
      >
        {t("percentOfTotal")}
      </Typography>

      {/* One hairline-separated row per contributing ingredient. */}
      {rows.map(({ ing, qty, calories }) => {
        const name =
          (locale === "en" ? ing.en_name : ing.name) ??
          ing.name ??
          ing.en_name ??
          "";
        const percent = total > 0 ? Math.round((calories / total) * 100) : 0;
        // Per-serving portion and calories (the whole-dish figures / servings).
        const portion = (Number(ing.quantity) * qty) / servings;
        const perServingCalories = Math.round(calories / servings);

        return (
          <Box
            key={ing.id}
            flexDirection="column"
            gap={3}
            paddingY={6}
            styles={{ borderTop: HAIRLINE }}
          >
            <Box alignItems="baseline" justifyContent="space-between" gap={8}>
              <Typography
                variant="body"
                fontWeight={700}
                color="var(--foreground)"
                minWidth={0}
                styles={{ overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {name}
              </Typography>
              <Typography
                variant="body"
                fontWeight={700}
                color="var(--foreground)"
                styles={{ whiteSpace: "nowrap" }}
              >
                {percent}%
              </Typography>
            </Box>

            <Box alignItems="center" justifyContent="space-between" gap={10}>
              <Typography
                variant="caption"
                color="var(--foreground)"
                styles={{ whiteSpace: "nowrap" }}
              >
                {formatPortion(portion, ing.unit!)} ·{" "}
                {t("caloriesValue", { value: perServingCalories })}
              </Typography>

              {/* Slim monochrome share bar: track + foreground fill. */}
              <Box
                flex={1}
                maxWidth={96}
                height={6}
                backgroundColor="color-mix(in srgb, var(--foreground) 15%, transparent)"
                styles={{ overflow: "hidden" }}
              >
                <Box
                  height="100%"
                  width={`${percent}%`}
                  backgroundColor="var(--foreground)"
                />
              </Box>
            </Box>
          </Box>
        );
      })}

      {/* Thick footer divider, then the reference-diet footnote. */}
      <Box
        height={RULE_THICK}
        backgroundColor="var(--foreground)"
        marginTop={4}
      />
      <Typography
        variant="caption"
        color="var(--foreground)"
        paddingTop={6}
        styles={{ lineHeight: 1.35 }}
      >
        {t("dailyValueNote", { value: dailyValue })}
      </Typography>
    </Card>
  );
}

export default NutritionLabel;
