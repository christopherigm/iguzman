"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import type { MenuItemIngredient } from "@/lib/catalog";
import {
  NUTRIENT_ROWS,
  formatNutrientAmount,
  formatPortion,
  nutritionRows,
  scaleNutrient,
} from "@/lib/nutrition";
import { resolveChoice } from "@/lib/menu-selection";
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

/** Each indent level of a sub-nutrient shifts its row right by this much. */
const INDENT_STEP = 14;

type NutritionView = "ingredients" | "facts";

/** A chartable ingredient the customer currently has in the order (qty > 0). */
interface SelectedRow {
  ing: MenuItemIngredient;
  qty: number;
}

interface NutritionLabelProps {
  ingredients: MenuItemIngredient[];
  locale: string;
  /** Servings the dish yields; figures below are divided by it. Null/0 = 1. */
  portions: number | null;
}

/**
 * A menu item's nutrition card, styled after the FDA "Nutrition Facts" panel and
 * offering two views the customer can switch between:
 *
 *   - **By ingredient** - the calorie contribution of each selected ingredient,
 *     with a share-of-total bar (the original layout).
 *   - **Full label** - the classic FDA panel: Calories headline followed by
 *     every nutrient with its amount and % Daily Value.
 *
 * Both views are **live**: each ingredient's contribution scales with the
 * quantity the customer has chosen in the customiser (shared via
 * `MenuCustomizationProvider`), only the ingredients currently in the order
 * (selected quantity > 0) count, and every figure is divided by `portions` so it
 * reads *per serving*, with an "N servings per item" line above. Monochrome and
 * square-cornered to read as the classic label; the heavy rules track
 * `--foreground` so it works in light and dark. Returns null when nothing is
 * selected that carries chartable data - callers should still gate on
 * `nutritionRows` before reserving layout space for it.
 */
export function NutritionLabel({
  ingredients,
  locale,
  portions,
}: NutritionLabelProps) {
  const t = useTranslations("Menu");
  const { quantities, options } = useMenuCustomization();
  const [view, setView] = useState<NutritionView>("facts");

  // Every figure on the label is stated *per serving*: the whole-dish totals are
  // divided by how many servings the dish yields (1 when unset).
  const servings = portions && portions > 0 ? portions : 1;

  // The chartable ingredients actually in the order, each with the quantity the
  // customer selected; both views derive from this. For a single-select choice
  // group we first substitute the customer's chosen option (its nutrition is
  // stated against the group's shared portion), so the label follows the pick.
  const selected: SelectedRow[] = useMemo(() => {
    const effective = ingredients.map((ing) => {
      const choice = resolveChoice(ing, options[ing.id]);
      return {
        ...ing,
        ingredient: choice.ingredient,
        ingredient_detail: choice.ingredient_detail,
        name: choice.name,
        en_name: choice.en_name,
        image: choice.image,
        calories: choice.calories,
      };
    });
    return nutritionRows(effective)
      .map((ing) => ({ ing, qty: quantities[ing.id] ?? ing.default_units }))
      .filter((r) => r.qty > 0);
  }, [ingredients, quantities, options]);

  const totalCalories = selected.reduce(
    (sum, r) => sum + (r.ing.calories ?? 0) * r.qty,
    0,
  );
  if (selected.length === 0 || totalCalories === 0) return null;

  // The whole-dish calorie total split across its servings.
  const perServingCalories = totalCalories / servings;

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
      {/* Masthead: the label title, shared by both views. */}
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

      {/* Segmented toggle between the two layouts. */}
      <Box
        role="group"
        marginTop={8}
        marginBottom={4}
        styles={{ border: HAIRLINE, overflow: "hidden" }}
      >
        {(
          [
            ["ingredients", t("tabByIngredient")],
            ["facts", t("tabFullLabel")],
          ] as const
        ).map(([value, label]) => {
          const active = view === value;
          return (
            <Button
              key={value}
              unstyled
              flex={1}
              paddingY={6}
              paddingX={8}
              backgroundColor={active ? "var(--foreground)" : "transparent"}
              color={active ? "var(--background)" : "var(--foreground)"}
              onClick={() => setView(value)}
              aria-pressed={active}
              styles={{ fontWeight: 700, fontSize: "0.75rem" }}
            >
              {label}
            </Button>
          );
        })}
      </Box>

      {view === "ingredients" ? (
        <IngredientBreakdown
          rows={selected}
          totalCalories={totalCalories}
          perServingCalories={perServingCalories}
          servings={servings}
          locale={locale}
        />
      ) : (
        <FdaFacts
          rows={selected}
          perServingCalories={perServingCalories}
          servings={servings}
        />
      )}
    </Card>
  );
}

/**
 * "By ingredient" view: the total calories headline, then one hairline-separated
 * row per contributing ingredient showing its per-serving portion, calories, and
 * share of the total as a slim monochrome bar.
 */
function IngredientBreakdown({
  rows,
  totalCalories,
  perServingCalories,
  servings,
  locale,
}: {
  rows: SelectedRow[];
  totalCalories: number;
  perServingCalories: number;
  servings: number;
  locale: string;
}) {
  const t = useTranslations("Menu");
  const dailyValue = Math.round((perServingCalories / DAILY_CALORIES) * 100);

  return (
    <>
      {/* Thick divider before "Amount Per Serving". */}
      <Box height={RULE_THICK} backgroundColor="var(--foreground)" />

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
          {Math.round(perServingCalories)}
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
      {rows.map(({ ing, qty }) => {
        const calories = (ing.calories ?? 0) * qty;
        if (calories <= 0) return null;
        const name =
          (locale === "en" ? ing.en_name : ing.name) ??
          ing.name ??
          ing.en_name ??
          "";
        const percent =
          totalCalories > 0 ? Math.round((calories / totalCalories) * 100) : 0;
        // Per-serving portion and calories (the whole-dish figures / servings).
        const portion = (Number(ing.quantity) * qty) / servings;
        const perServing = Math.round(calories / servings);

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
                {t("caloriesValue", { value: perServing })}
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
    </>
  );
}

/**
 * "Full label" view: the classic FDA Nutrition Facts panel. The Calories
 * headline, then every nutrient row with its per-serving amount and (where the
 * FDA defines one) its % Daily Value, split into the macro and vitamin/mineral
 * sections by a thick rule and closed with the standard footnote.
 */
function FdaFacts({
  rows,
  perServingCalories,
  servings,
}: {
  rows: SelectedRow[];
  perServingCalories: number;
  servings: number;
}) {
  const t = useTranslations("Menu");

  // Sum each nutrient across the selected ingredients (scaling by the chosen
  // quantity), then divide by servings so every figure reads per serving.
  const perServing = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const { key } of NUTRIENT_ROWS) {
      let sum = 0;
      for (const { ing, qty } of rows) {
        const value = scaleNutrient(ing, key);
        if (value != null) sum += value * qty;
      }
      totals[key] = sum / servings;
    }
    return totals;
  }, [rows, servings]);

  return (
    <>
      {/* Serving-size line above the thick rule. */}
      <Box
        alignItems="baseline"
        justifyContent="space-between"
        gap={8}
        paddingBottom={2}
      >
        <Typography
          variant="caption"
          fontWeight={700}
          color="var(--foreground)"
        >
          {t("servingSize")}
        </Typography>
        <Typography
          variant="caption"
          fontWeight={700}
          color="var(--foreground)"
        >
          {t("servingSizeAmount")}
        </Typography>
      </Box>

      {/* Thick divider before the Calories headline. */}
      <Box height={RULE_THICK} backgroundColor="var(--foreground)" />

      {/* Headline figure: Calories, in the label's largest weight. */}
      <Box
        alignItems="baseline"
        justifyContent="space-between"
        gap={8}
        paddingTop={4}
        paddingBottom={4}
        styles={{ borderBottom: `${RULE_MEDIUM}px solid var(--foreground)` }}
      >
        <Typography variant="h3" fontWeight={800} color="var(--foreground)">
          {t("calories")}
        </Typography>
        <Typography variant="h2" fontWeight={800} color="var(--foreground)">
          {Math.round(perServingCalories)}
        </Typography>
      </Box>

      {/* Right-aligned "% Daily Value" column header. */}
      <Typography
        variant="label"
        fontWeight={700}
        color="var(--foreground)"
        textAlign="right"
        paddingY={3}
        styles={{ borderBottom: HAIRLINE }}
      >
        {t("percentDailyValue")}
      </Typography>

      {NUTRIENT_ROWS.map((meta, index) => {
        const amount = perServing[meta.key] ?? 0;
        const amountText = formatNutrientAmount(amount, meta.unit);
        const percent =
          meta.dailyValue != null
            ? `${Math.round((amount / meta.dailyValue) * 100)}%`
            : "";
        // A thick rule divides the macro nutrients from the vitamins/minerals.
        const startsMicro =
          meta.group === "micro" && NUTRIENT_ROWS[index - 1]?.group === "macro";

        return (
          <Box key={meta.key} flexDirection="column">
            {startsMicro && (
              <Box height={RULE_THICK} backgroundColor="var(--foreground)" />
            )}
            <Box
              alignItems="baseline"
              justifyContent="space-between"
              gap={8}
              paddingY={4}
              paddingLeft={meta.indent * INDENT_STEP}
              // The thick section rule already separates the first vitamin row;
              // every other row gets a hairline above it.
              styles={startsMicro ? undefined : { borderTop: HAIRLINE }}
            >
              <Typography
                variant="caption"
                color="var(--foreground)"
                fontWeight={meta.bold ? 700 : 400}
                minWidth={0}
              >
                {meta.includes
                  ? t(meta.labelKey, { amount: amountText })
                  : `${t(meta.labelKey)} ${amountText}`}
              </Typography>
              {percent && (
                <Typography
                  variant="caption"
                  fontWeight={700}
                  color="var(--foreground)"
                  styles={{ whiteSpace: "nowrap" }}
                >
                  {percent}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}

      {/* Thick footer divider, then the FDA reference-diet footnote. */}
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
        {t("dailyValueFootnote")}
      </Typography>
    </>
  );
}

export default NutritionLabel;
