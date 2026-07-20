"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";

/** One purchasing-source row in the ingredient form's Providers section. */
export type ProviderRow = {
  name: string;
  url: string;
  price: string;
  currency: string;
};

type Props = {
  providers: ProviderRow[];
  onChange: (next: ProviderRow[]) => void;
  /** The currency choices (same list the form's currency select uses). */
  currencyOptions: { value: string; label: string }[];
  /** Default currency for a newly-added blank row (the ingredient's currency). */
  defaultCurrency: string;
};

/**
 * "Providers" — a full-replace list of purchasing sources for the ingredient,
 * each a store name, link, price and currency. Edited entirely in the form's
 * local state and persisted (nested) when the ingredient is saved. Rows can be
 * added by hand here or appended by the web price search.
 */
export function IngredientProvidersEditor({
  providers,
  onChange,
  currencyOptions,
  defaultCurrency,
}: Props) {
  const t = useTranslations("Admin");

  const update = (index: number, patch: Partial<ProviderRow>) => {
    onChange(
      providers.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const remove = (index: number) => {
    onChange(providers.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([
      ...providers,
      { name: "", url: "", price: "", currency: defaultCurrency },
    ]);
  };

  return (
    <Box flexDirection="column" gap={12} paddingTop={24}>
      <Box flexDirection="column" gap={2}>
        <Typography variant="label" fontWeight={800} color="var(--foreground)">
          {t("providersTitle")}
        </Typography>
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("providersHint")}
        </Typography>
      </Box>

      {providers.length === 0 && (
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("providersEmpty")}
        </Typography>
      )}

      {providers.map((row, index) => (
        <Box
          key={index}
          display="flex"
          alignItems="flex-start"
          gap={8}
          flexWrap="wrap"
        >
          <TextInput
            label={t("providerName")}
            value={row.name}
            onChange={(v) => update(index, { name: v })}
            minWidth={140}
            flex={1}
          />
          <TextInput
            label={t("providerUrl")}
            type="url"
            value={row.url}
            onChange={(v) => update(index, { url: v })}
            minWidth={200}
            flex={2}
          />
          <TextInput
            label={t("providerPrice")}
            type="number"
            value={row.price}
            onChange={(v) => update(index, { price: v })}
            width={110}
          />
          <Box width={100}>
            <Select
              label={t("providerCurrency")}
              value={row.currency}
              onChange={(v) => update(index, { currency: v })}
              options={currencyOptions.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Box>
          <Button
            icon="/icons/x.svg"
            iconSize="16px"
            onClick={() => remove(index)}
            aria-label={t("providerRemove")}
            title={t("providerRemove")}
            size="md"
          />
        </Box>
      ))}

      <Box>
        <Button
          text={t("providerAdd")}
          icon="/icons/add.svg"
          iconSize="16px"
          onClick={add}
          size="md"
        />
      </Box>
    </Box>
  );
}
