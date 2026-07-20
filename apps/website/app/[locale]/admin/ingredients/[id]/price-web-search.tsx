"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import {
  lookupIngredientPrice,
  type IngredientProviderResult,
} from "@/lib/admin-api";
import type { ProviderRow } from "./ingredient-providers-editor";

type Props = {
  /** The full form state — read for identity/basis/currency and the "was" line. */
  values: Record<string, unknown>;
  /** Writes the applied price/currency back into the form. */
  onChange: (key: string, value: unknown) => void;
  /** Appends the found providers to the Providers section. */
  onAddProviders: (rows: ProviderRow[]) => void;
};

type PriceResult = {
  price: string | null;
  currency: string;
  providers: IngredientProviderResult[];
};

/**
 * "Search price on web" — estimates the ingredient's price online (scraper + LLM,
 * entirely backend-side) from its name / unit / basis / currency, then previews
 * the estimate and the provider sources it found so the operator can Apply or
 * Discard. Apply sets the price + currency and appends the providers; nothing is
 * saved until the form itself is submitted.
 */
export function PriceWebSearch({ values, onChange, onAddProviders }: Props) {
  const t = useTranslations("Admin");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [empty, setEmpty] = useState(false);

  const name = String(values.name ?? "").trim();
  const enName = String(values.en_name ?? "").trim();
  const currency = String(values.currency ?? "USD");
  const canSearch = Boolean(name || enName);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setEmpty(false);
    try {
      const found = await lookupIngredientPrice({
        name,
        en_name: enName,
        unit: String(values.unit ?? "g"),
        nutrition_basis_quantity: String(values.nutrition_basis_quantity ?? "100"),
        currency,
      });
      if (found.price == null && found.providers.length === 0) {
        setEmpty(true);
      } else {
        setResult(found);
      }
    } catch {
      setError(t("priceSearchError"));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    if (result.price != null) {
      onChange("price", result.price);
      onChange("currency", result.currency);
    }
    if (result.providers.length > 0) {
      onAddProviders(
        result.providers.map((p) => ({
          name: p.name ?? "",
          url: p.url,
          price: p.price ?? "",
          currency: p.currency,
        })),
      );
    }
    setResult(null);
  };

  const handleDiscard = () => {
    setResult(null);
    setEmpty(false);
  };

  const prevPrice = String(values.price ?? "").trim();

  return (
    <Box flexDirection="column" gap={10} paddingTop={16}>
      <Box display="flex" alignItems="center" gap={12} flexWrap="wrap">
        <Button
          text={loading ? t("priceSearchSearching") : t("priceSearchWeb")}
          icon="/icons/search.svg"
          iconSize="16px"
          onClick={handleSearch}
          disabled={loading || !canSearch}
          size="md"
        />
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("priceSearchHint")}
        </Typography>
      </Box>

      {error && (
        <Typography variant="caption" color="#e53935">
          {error}
        </Typography>
      )}

      {empty && (
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("priceSearchNone")}
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
          <Typography variant="label" fontWeight={700} color="var(--foreground)">
            {t("priceSearchResultsTitle")}
          </Typography>

          {result.price != null && (
            <Typography variant="body" color="var(--foreground)">
              {result.price} {result.currency}{" "}
              <Typography
                as="span"
                variant="caption"
                color="var(--muted-foreground, #6b7280)"
              >
                ({t("priceSearchWas", { value: prevPrice || "—" })})
              </Typography>
            </Typography>
          )}

          {result.providers.length > 0 && (
            <Box flexDirection="column" gap={4}>
              <Typography
                variant="caption"
                fontWeight={700}
                color="var(--foreground)"
              >
                {t("priceSearchProvidersFound", {
                  count: result.providers.length,
                })}
              </Typography>
              {result.providers.map((p, i) => (
                <Typography
                  key={i}
                  variant="caption"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {(p.name || p.url) +
                    (p.price != null ? ` — ${p.price} ${p.currency}` : "")}
                </Typography>
              ))}
            </Box>
          )}

          <Box display="flex" gap={8} alignItems="center" marginTop={8}>
            <Button
              text={t("priceSearchDiscard")}
              onClick={handleDiscard}
              size="md"
            />
            <Button
              text={t("priceSearchApply")}
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
