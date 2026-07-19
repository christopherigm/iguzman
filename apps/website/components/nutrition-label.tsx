import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import type { MenuItemIngredient } from "@/lib/catalog";

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

/**
 * The ingredients that contribute to the nutrition breakdown: only those with a
 * descriptive portion (quantity + unit) *and* a positive calorie value. An
 * ingredient missing any of these can't be meaningfully charted, so it is left
 * out entirely (both here and from the total).
 */
export function nutritionRows(
  ingredients: MenuItemIngredient[],
): MenuItemIngredient[] {
  return ingredients.filter(
    (i) =>
      i.quantity != null &&
      i.unit != null &&
      i.calories != null &&
      i.calories > 0,
  );
}

/** Drop a trailing `.0` from the decimal portion string (e.g. "100.0" → "100"). */
function formatPortion(quantity: string, unit: string): string {
  const n = Number(quantity);
  const value = Number.isFinite(n) ? String(n) : quantity;
  return `${value} ${unit}`;
}

interface NutritionLabelProps {
  ingredients: MenuItemIngredient[];
  locale: string;
}

/**
 * A menu item's calorie breakdown styled after the FDA "Nutrition Facts" panel:
 * a bold title, the total calories as the headline figure, then one hairline-
 * separated row per contributing ingredient showing its portion, calories, and
 * share of the total. Monochrome and square-cornered to read as the classic
 * label; the heavy rules track `--foreground` so it works in light and dark.
 * Returns null when no ingredient carries enough data to chart - callers should
 * gate on `nutritionRows` before reserving layout space for it.
 */
export async function NutritionLabel({
  ingredients,
  locale,
}: NutritionLabelProps) {
  const t = await getTranslations("Menu");

  const rows = nutritionRows(ingredients);
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, i) => sum + (i.calories ?? 0), 0);
  const dailyValue = Math.round((total / DAILY_CALORIES) * 100);

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
          {total}
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
      {rows.map((ing) => {
        const name =
          (locale === "en" ? ing.en_name : ing.name) ??
          ing.name ??
          ing.en_name ??
          "";
        const percent =
          total > 0 ? Math.round((ing.calories! / total) * 100) : 0;

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
                {formatPortion(ing.quantity!, ing.unit!)} ·{" "}
                {t("caloriesValue", { value: ing.calories! })}
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
