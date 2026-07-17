"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";

/** One editable ingredient row. `id` is present once persisted; `key` is a
 *  stable client id used only for React list identity. */
export interface IngredientRow {
  key: string;
  id?: number;
  name: string;
  en_name: string;
  price: string;
  quantity: string;
  unit: string;
  is_default: boolean;
  is_removable: boolean;
  max_quantity: string;
  enabled: boolean;
}

export const UNIT_OPTIONS = [
  { value: "", label: "—" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "mg", label: "mg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "oz", label: "oz" },
  { value: "lb", label: "lb" },
  { value: "cup", label: "cup" },
  { value: "tbsp", label: "tbsp" },
  { value: "tsp", label: "tsp" },
  { value: "pc", label: "pc" },
  { value: "slice", label: "slice" },
  { value: "scoop", label: "scoop" },
];

let rowCounter = 0;
export function newIngredientRow(): IngredientRow {
  rowCounter += 1;
  return {
    key: `ing-${Date.now()}-${rowCounter}`,
    name: "",
    en_name: "",
    price: "0.00",
    quantity: "",
    unit: "",
    is_default: true,
    is_removable: true,
    max_quantity: "1",
    enabled: true,
  };
}

interface Props {
  value: IngredientRow[];
  onChange: (rows: IngredientRow[]) => void;
  currency: string;
}

/**
 * Editor for a menu item's priced ingredients (base price + add-on deltas).
 *
 * Each row is one customisation the customer sees: defaults are included and
 * pre-selected; `price` is the up-charge per chargeable unit; `max_quantity`
 * caps how many the customer may add (2 = "double"). Pure/controlled - it holds
 * no persistence logic; the parent page diffs the list against the loaded rows
 * and calls the create/update/delete API on save.
 */
export function MenuIngredientsEditor({ value, onChange, currency }: Props) {
  const t = useTranslations("Admin");

  const update = (key: string, patch: Partial<IngredientRow>) =>
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const remove = (key: string) => onChange(value.filter((r) => r.key !== key));

  const add = () => onChange([...value, newIngredientRow()]);

  return (
    <Box display="flex" flexDirection="column" gap="12px">
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap="12px"
      >
        <Typography variant="label">{t("ingredients")}</Typography>
        <Button
          text={t("addIngredient")}
          kind="primary"
          size="sm"
          onClick={add}
          type="button"
        />
      </Box>

      <Typography variant="caption" color="var(--muted, #6b7280)">
        {t("ingredientsHint")}
      </Typography>

      {value.length === 0 && (
        <Typography variant="caption" color="var(--muted, #6b7280)">
          {t("noIngredients")}
        </Typography>
      )}

      {value.map((row) => (
        <Box
          key={row.key}
          padding="12px"
          borderRadius="10px"
          border="1px solid var(--border, #e5e7eb)"
          backgroundColor="var(--surface-2, #f9fafb)"
          display="flex"
          flexDirection="column"
          gap="10px"
        >
          <Box
            display="grid"
            gap="10px"
            styles={{
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            }}
          >
            <TextInput
              label={t("ingredientName")}
              value={row.name}
              onChange={(v) => update(row.key, { name: v })}
            />
            <TextInput
              label="Name (EN)"
              value={row.en_name}
              onChange={(v) => update(row.key, { en_name: v })}
            />
            <TextInput
              label={`${t("upcharge")} (${currency})`}
              format="number"
              value={row.price}
              onChange={(v) => update(row.key, { price: v })}
            />
            <TextInput
              label={t("portion")}
              format="number"
              value={row.quantity}
              onChange={(v) => update(row.key, { quantity: v })}
            />
            <Select
              label={t("unit")}
              value={row.unit}
              onChange={(v) => update(row.key, { unit: v })}
              options={UNIT_OPTIONS}
            />
            <TextInput
              label={t("maxQuantity")}
              format="number"
              value={row.max_quantity}
              onChange={(v) => update(row.key, { max_quantity: v })}
            />
          </Box>

          <Box display="flex" alignItems="center" gap="20px" flexWrap="wrap">
            <Box display="flex" alignItems="center" gap="8px">
              <Switch
                checked={row.is_default}
                onChange={(c) => update(row.key, { is_default: c })}
                aria-label={t("includedByDefault")}
              />
              <Typography variant="caption">
                {t("includedByDefault")}
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap="8px">
              <Switch
                checked={row.is_removable}
                onChange={(c) => update(row.key, { is_removable: c })}
                aria-label={t("removable")}
              />
              <Typography variant="caption">{t("removable")}</Typography>
            </Box>
            <Button
              text={t("remove")}
              unstyled
              size="sm"
              onClick={() => remove(row.key)}
              type="button"
              styles={{
                color: "var(--danger, #e53935)",
                marginLeft: "auto",
                cursor: "pointer",
              }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
