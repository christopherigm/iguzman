"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";

/**
 * One purchasing-source row in the ingredient form's Providers section.
 * `name` has no input of its own — it is carried through from the web price
 * search (and from what was already saved) so the store is still recorded.
 */
export type ProviderRow = {
  name: string;
  url: string;
  price: string;
};

type Props = {
  providers: ProviderRow[];
  onChange: (next: ProviderRow[]) => void;
};

/**
 * "Providers" — a full-replace list of purchasing sources for the ingredient,
 * each a link and a price. The currency is the ingredient's own, so there is no
 * per-row currency. Edited entirely in the form's local state and persisted
 * (nested) when the ingredient is saved. Rows can be added by hand here or
 * appended by the web price search.
 */
export function IngredientProvidersEditor({ providers, onChange }: Props) {
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
    onChange([...providers, { name: "", url: "", price: "" }]);
  };

  return (
    <Box flexDirection="column" gap={12}>
      {/* Section header — matches the AdminForm pair-group header. */}
      <Box
        paddingTop={32}
        paddingBottom={2}
        styles={{
          borderBottom:
            "1px solid color-mix(in srgb, var(--foreground) 20%, transparent)",
        }}
      >
        <Typography
          variant="label"
          fontWeight={800}
          color="var(--foreground)"
          styles={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          {t("providersTitle")}
        </Typography>
      </Box>

      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {t("providersHint")}
      </Typography>

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
          <Button
            icon="/icons/delete-trash-icon.svg"
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
