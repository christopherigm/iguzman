"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { lookupIngredientNutrition } from "@/lib/admin-api";

type NutrientField = { key: string; label: string };

type Props = {
  /** The full form state - read for identity/basis and the "was" comparison. */
  values: Record<string, unknown>;
  /** Writes an applied nutrient back into the form. */
  onChange: (key: string, value: unknown) => void;
  /** The nutrient fields (key + display label), in panel order. */
  nutrients: NutrientField[];
};

/**
 * "Search on web" — looks up the ingredient's FDA nutrition values online
 * (scraper + LLM, entirely backend-side) from its name / basis, then previews
 * the result so the operator can Apply or Discard before it touches the form.
 *
 * Only fields the sources actually supported come back (the rest are null), and
 * Apply writes only those — a nutrient the web didn't cover keeps its existing
 * value rather than being wiped.
 */
export function NutritionWebSearch({ values, onChange, nutrients }: Props) {
  const t = useTranslations("Admin");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The fetched values, keyed by nutrient field. null once nothing is pending.
  const [result, setResult] = useState<Record<string, string | null> | null>(
    null,
  );
  const [empty, setEmpty] = useState(false);

  const name = String(values.name ?? "").trim();
  const enName = String(values.en_name ?? "").trim();
  const canSearch = Boolean(name || enName);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setEmpty(false);
    try {
      const { nutrients: found } = await lookupIngredientNutrition({
        name,
        en_name: enName,
        unit: String(values.unit ?? "g"),
        nutrition_basis_quantity: String(
          values.nutrition_basis_quantity ?? "100",
        ),
      });
      const hasAny = Object.values(found).some((v) => v != null);
      if (!hasAny) {
        setEmpty(true);
      } else {
        setResult(found);
      }
    } catch {
      setError(t("nutritionSearchError"));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    for (const { key } of nutrients) {
      const value = result[key];
      if (value != null) onChange(key, value);
    }
    setResult(null);
  };

  const handleDiscard = () => {
    setResult(null);
    setEmpty(false);
  };

  // Only the fields that came back with a value are worth previewing.
  const changedRows = result
    ? nutrients.filter(({ key }) => result[key] != null)
    : [];

  return (
    <Box flexDirection="column" gap={10} paddingTop={16}>
      <Box display="flex" alignItems="center" gap={12} flexWrap="wrap">
        <Button
          text={
            loading ? t("nutritionSearchSearching") : t("nutritionSearchWeb")
          }
          icon="/icons/search.svg"
          iconSize="16px"
          onClick={handleSearch}
          disabled={loading || !canSearch}
          size="md"
        />
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("nutritionSearchHint")}
        </Typography>
      </Box>

      {error && (
        <Typography variant="caption" color="#e53935">
          {error}
        </Typography>
      )}

      {empty && (
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("nutritionSearchNone")}
        </Typography>
      )}

      {result && (
        <Box
          flexDirection="column"
          gap={10}
          padding="12px 14px"
          borderRadius={8}
          border="1px solid color-mix(in srgb, var(--accent, #06b6d4) 30%, transparent)"
          backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 5%, transparent)"
        >
          <Typography
            variant="label"
            fontWeight={700}
            color="var(--foreground)"
          >
            {t("nutritionSearchResultsTitle")}
          </Typography>
          <Box
            display="grid"
            gap={4}
            styles={{ gridTemplateColumns: "1fr auto" }}
          >
            {changedRows.map(({ key, label }) => {
              const prev = String(values[key] ?? "").trim();
              return (
                <Box key={key} display="contents">
                  <Typography variant="body" color="var(--foreground)">
                    {label}
                  </Typography>
                  <Typography variant="body" color="var(--foreground)">
                    {result[key]}{" "}
                    <Typography
                      as="span"
                      variant="caption"
                      color="var(--muted-foreground, #6b7280)"
                    >
                      ({t("nutritionSearchWas", { value: prev || "—" })})
                    </Typography>
                  </Typography>
                </Box>
              );
            })}
          </Box>
          <Box display="flex" gap={8} alignItems="center" marginTop={8}>
            <Button
              text={t("nutritionSearchDiscard")}
              onClick={handleDiscard}
              size="md"
            />
            <Button
              text={t("nutritionSearchApply")}
              onClick={handleApply}
              size="md"
              kind="primary"
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
