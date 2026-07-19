"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";

/** One editable ingredient row. `id` is present once persisted; `key` is a
 *  stable client id used only for React list identity.
 *
 *  Identity (name/image) and nutrition now live on the referenced reusable
 *  Ingredient (`ingredient` holds its id), so this row only carries the recipe
 *  *portion* and *pricing*. Calories are computed by the API from the chosen
 *  ingredient scaled to `quantity`/`unit`. */
export interface IngredientRow {
  key: string;
  id?: number;
  /** The referenced reusable Ingredient's id ("" until one is picked). */
  ingredient: number | "";
  price: string;
  quantity: string;
  unit: string;
  /**
   * `false` = included by default (locked, in the base price); `true` = an
   * optional add-on the customer adds up to `max_quantity`, each unit charged.
   */
  is_removable: boolean;
  max_quantity: string;
  enabled: boolean;
}

/** The subset of an Ingredient the picker needs to render options + a hint. */
export interface IngredientOption {
  id: number;
  name: string | null;
  en_name: string | null;
  unit: string;
  nutrition_basis_quantity: string | null;
  calories: string | null;
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
    ingredient: "",
    price: "0.00",
    quantity: "",
    unit: "",
    // New rows default to included-by-default (part of the base recipe); flip
    // "Removable" on to make it a customer-chosen add-on.
    is_removable: false,
    max_quantity: "1",
    enabled: true,
  };
}

interface Props {
  value: IngredientRow[];
  onChange: (rows: IngredientRow[]) => void;
  currency: string;
  /** The tenant's reusable ingredient catalog, for the picker. */
  catalog: IngredientOption[];
}

/**
 * Editor for a menu item's priced ingredients (base price + add-on deltas).
 *
 * Each row picks one reusable Ingredient from the tenant catalog, then sets the
 * recipe portion and pricing. "Removable" off means the ingredient is included
 * by default (locked, in the base price); on makes it an optional add-on where
 * `price` is the up-charge per unit and `max_quantity` caps how many the
 * customer may add (2 = "double"). Rows are drag-reorderable (their array order
 * is persisted as `sort_order`), and "Add ingredient" inserts a fresh row at the
 * top. Pure/controlled - it holds no persistence logic; the parent page diffs
 * the list against the loaded rows and calls the create/update/delete API on
 * save.
 */
export function MenuIngredientsEditor({
  value,
  onChange,
  currency,
  catalog,
}: Props) {
  const t = useTranslations("Admin");

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const update = (key: string, patch: Partial<IngredientRow>) =>
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const remove = (key: string) => onChange(value.filter((r) => r.key !== key));

  // New rows go to the top so the just-added ingredient is immediately visible
  // without scrolling past the existing list.
  const add = () => onChange([newIngredientRow(), ...value]);

  const catalogOptions = [
    { value: "", label: t("selectIngredient") ?? "— Select —" },
    ...catalog.map((c) => ({
      value: String(c.id),
      label: String(c.name ?? c.en_name ?? c.id),
    })),
  ];

  // A short "62 kcal per 1 pc" hint for the currently picked ingredient.
  const basisHint = (row: IngredientRow): string | null => {
    const picked = catalog.find((c) => c.id === row.ingredient);
    if (!picked) return null;
    const parts: string[] = [];
    if (picked.calories != null && picked.calories !== "")
      parts.push(`${Number(picked.calories)} kcal`);
    parts.push(
      `${t("nutritionPer") ?? "per"} ${Number(
        picked.nutrition_basis_quantity ?? "0",
      )} ${picked.unit}`,
    );
    return parts.join(" ");
  };

  // Drag-to-reorder: the handle starts the drag; each row is a drop target.
  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDrop = (e: DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...value];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    next.splice(dropIndex, 0, moved);
    onChange(next);
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

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

      {/* One card per ingredient, laid out two-up from `md` (full width below).
          Each card is a grid item so the row wraps cleanly on narrow screens. */}
      <Grid container spacing={1.5}>
        {value.map((row, index) => {
          const isOver = dragOverIndex === index && dragIndex !== index;
          const hint = basisHint(row);
          return (
            <Grid key={row.key} size={{ xs: 12, md: 6 }}>
              <Card
                gap="10px"
                border={
                  isOver
                    ? "1px solid var(--accent, #06b6d4)"
                    : "1px solid var(--border, #e5e7eb)"
                }
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnter={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, index)}
                styles={{
                  opacity: dragIndex === index ? 0.5 : 1,
                  overflow: "visible",
                }}
              >
                {/* Row 1: switches on the left; delete + move handle pushed right.
                Wraps on narrow screens so nothing overflows the card. */}
                <Box
                  display="flex"
                  alignItems="center"
                  gap="16px"
                  flexWrap="wrap"
                >
                  <Box display="flex" alignItems="center" gap="8px">
                    <Switch
                      checked={row.enabled}
                      onChange={(c) => update(row.key, { enabled: c })}
                      aria-label={t("enabled")}
                    />
                    <Typography variant="caption">{t("enabled")}</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap="8px">
                    <Switch
                      checked={row.is_removable}
                      onChange={(c) => update(row.key, { is_removable: c })}
                      aria-label={t("removable")}
                    />
                    <Typography variant="caption">{t("removable")}</Typography>
                  </Box>
                  <Box
                    display="flex"
                    alignItems="center"
                    gap="8px"
                    marginLeft="auto"
                  >
                    <Button
                      text={t("remove")}
                      kind="error"
                      size="sm"
                      onClick={() => remove(row.key)}
                      type="button"
                    />
                    {/* The move handle doubles as the drag source for reordering. */}
                    <span
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragEnd={handleDragEnd}
                      aria-label={t("dragToReorder")}
                      title={t("dragToReorder")}
                      style={{
                        cursor: "grab",
                        userSelect: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "6px 10px",
                        fontSize: 16,
                        lineHeight: 1,
                        borderRadius: 8,
                        border: "1px solid var(--border, #e5e7eb)",
                        color: "var(--muted, #6b7280)",
                      }}
                    >
                      ⠿
                    </span>
                  </Box>
                </Box>

                <Typography variant="caption" color="var(--muted, #6b7280)">
                  {t("removableHint")}
                </Typography>

                {/* Row 2: the ingredient picker (with a nutrition-basis hint) above
                the portion + pricing fields. */}
                <Box display="flex" flexDirection="column" gap="6px">
                  <Select
                    label={t("ingredient")}
                    value={row.ingredient === "" ? "" : String(row.ingredient)}
                    onChange={(v) =>
                      update(row.key, { ingredient: v === "" ? "" : Number(v) })
                    }
                    options={catalogOptions}
                  />
                  {hint && (
                    <Typography variant="caption" color="var(--muted, #6b7280)">
                      {hint}
                    </Typography>
                  )}
                </Box>

                <Box
                  display="grid"
                  gap="10px"
                  alignItems="start"
                  styles={{
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  }}
                >
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
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
