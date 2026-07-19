"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { useLlmProxy, type LlmMessage } from "@repo/ui/use-llm";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";

/** One editable ingredient row. `id` is present once persisted; `key` is a
 *  stable client id used only for React list identity.
 *
 *  Image editing is tri-state so the parent can PATCH minimally:
 *  - `image`        - the persisted image URL loaded from the API (display only).
 *  - `imageBase64`  - a freshly-uploaded image awaiting save (base64 data URL).
 *  - `imageRemoved` - the persisted image was cleared with no replacement.
 *  When both `imageBase64` is null and `imageRemoved` is false, the image is
 *  left untouched on save. */
export interface IngredientRow {
  key: string;
  id?: number;
  name: string;
  en_name: string;
  image: string | null;
  imageBase64: string | null;
  imageRemoved: boolean;
  price: string;
  quantity: string;
  unit: string;
  calories: string;
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
    image: null,
    imageBase64: null,
    imageRemoved: false,
    price: "0.00",
    quantity: "",
    unit: "",
    calories: "",
    is_default: true,
    is_removable: true,
    max_quantity: "1",
    enabled: true,
  };
}

/** The two translatable name fields on a row. `en_name` holds English, `name`
 *  holds Spanish - so a translation of one always writes into the other. */
type NameField = "name" | "en_name";

// Build the LLM prompt for translating one name field into its counterpart.
function buildTranslateMessages(text: string, field: NameField): LlmMessage[] {
  if (field === "en_name") {
    return [
      {
        role: "system",
        content:
          "You are a professional translator. Translate the following text from English to Spanish. Return only the translated text - no explanations, labels, or formatting marks.",
      },
      { role: "user", content: text },
    ];
  }
  return [
    {
      role: "system",
      content:
        "Eres un traductor profesional. Traduce el siguiente texto del español al inglés. Devuelve únicamente el texto traducido - sin explicaciones, etiquetas ni marcas de formato.",
    },
    { role: "user", content: text },
  ];
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
 * caps how many the customer may add (2 = "double"). Rows are drag-reorderable
 * (their array order is persisted as `sort_order`), and "Add ingredient" inserts
 * a fresh row at the top. Pure/controlled - it holds no persistence logic; the
 * parent page diffs the list against the loaded rows and calls the
 * create/update/delete API on save.
 */
export function MenuIngredientsEditor({ value, onChange, currency }: Props) {
  const t = useTranslations("Admin");

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ── AI translate state ──────────────────────────────────────────────────
  // Only one translation runs at a time across the whole editor; the active
  // source is identified by its row key + which name field it came from.
  const { streamingText, isGenerating, generate, abort, reset } = useLlmProxy({
    temperature: 0.3,
  });
  const [activeTranslate, setActiveTranslate] = useState<{
    rowKey: string;
    field: NameField;
  } | null>(null);

  const update = (key: string, patch: Partial<IngredientRow>) =>
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // The field a translation writes into is the opposite language.
  const targetField = (field: NameField): NameField =>
    field === "en_name" ? "name" : "en_name";

  const triggerTranslate = async (
    rowKey: string,
    field: NameField,
    text: string,
  ) => {
    const source = text.trim();
    if (!source || isGenerating) return;
    setActiveTranslate({ rowKey, field });
    reset();
    await generate(buildTranslateMessages(source, field));
  };

  const acceptTranslate = () => {
    if (activeTranslate && streamingText) {
      update(activeTranslate.rowKey, {
        [targetField(activeTranslate.field)]: streamingText,
      });
    }
    setActiveTranslate(null);
    reset();
  };

  const discardTranslate = () => {
    if (isGenerating) abort();
    setActiveTranslate(null);
    reset();
  };

  // Reconcile the single-image AdminImageUploader (maxImages=1) back into the
  // row's tri-state image fields. `hadExisting` is captured at render from the
  // persisted URL, which never changes here, so it stays consistent.
  const handleImageChange = (
    rowKey: string,
    hadExisting: boolean,
    newImages: NewImage[],
    orderedExistingIds: number[],
  ) => {
    const base64 = newImages[0]?.base64 ?? null;
    const keptExisting = orderedExistingIds.length > 0;
    update(rowKey, {
      imageBase64: base64,
      imageRemoved: hadExisting && !keptExisting && !base64,
    });
  };

  const remove = (key: string) => onChange(value.filter((r) => r.key !== key));

  // New rows go to the top so the just-added ingredient is immediately visible
  // without scrolling past the existing list.
  const add = () => onChange([newIngredientRow(), ...value]);

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

      {value.map((row, index) => {
        const isOver = dragOverIndex === index && dragIndex !== index;
        return (
          <Card
            key={row.key}
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

            {/* Row 2: uploader column (fits its own width) + a fields column
                that holds the names row above the numeric fields row. The two
                columns wrap into a stack on narrow screens. */}
            <Box
              display="flex"
              gap="12px"
              alignItems="flex-start"
              flexWrap="wrap"
            >
              {/* Column 1: single-image uploader, sized to the control. `image`
                  seeds the existing thumb; new/removed states flow back via
                  handleImageChange. */}
              <Box maxWidth={96} width="100%" styles={{ flex: "0 0 96px" }}>
                <AdminImageUploader
                  compact
                  maxImages={1}
                  label={t("image")}
                  existingImages={
                    row.image ? [{ id: 0, url: row.image }] : []
                  }
                  onChange={(newImages, _deletedIds, orderedExistingIds) =>
                    handleImageChange(
                      row.key,
                      Boolean(row.image),
                      newImages,
                      orderedExistingIds,
                    )
                  }
                />
              </Box>

              {/* Column 2: names row, then the numeric fields row. */}
              <Box
                display="flex"
                flexDirection="column"
                gap="10px"
                styles={{ flex: "1 1 260px", minWidth: 0 }}
              >
                {/* Both names share one row; the translate button on each
                    writes its translation into the other language. */}
                <Box
                  display="grid"
                  gap="10px"
                  styles={{
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  {(
                    [
                      { field: "name" as NameField, label: t("ingredientName") },
                      { field: "en_name" as NameField, label: "Name (EN)" },
                    ] as const
                  ).map(({ field, label }) => {
                    const isActive =
                      activeTranslate?.rowKey === row.key &&
                      activeTranslate.field === field;
                    const fieldValue = row[field];
                    return (
                      <Box
                        key={field}
                        display="flex"
                        flexDirection="column"
                        gap="6px"
                      >
                        <Box
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          gap="8px"
                        >
                          <Typography variant="label">{label}</Typography>
                          <Button
                            icon="/icons/translate.svg"
                            iconSize="16px"
                            iconColor={
                              isActive
                                ? "var(--accent, #06b6d4)"
                                : "var(--foreground, #171717)"
                            }
                            disabled={isGenerating || !fieldValue.trim()}
                            onClick={() =>
                              triggerTranslate(row.key, field, fieldValue)
                            }
                            aria-label={t("translateLabel")}
                            title={t("translateLabel")}
                          />
                        </Box>
                        <TextInput
                          aria-label={label}
                          value={fieldValue}
                          onChange={(v) => update(row.key, { [field]: v })}
                        />
                        {isActive && (
                          <Box
                            display="flex"
                            flexDirection="column"
                            gap="8px"
                            padding="10px 12px"
                            borderRadius="8px"
                            border="1px solid color-mix(in srgb, var(--foreground) 15%, transparent)"
                            backgroundColor="color-mix(in srgb, var(--foreground) 3%, transparent)"
                          >
                            <Typography variant="body">
                              {streamingText || "…"}
                            </Typography>
                            <Box display="flex" gap="8px" alignItems="center">
                              {isGenerating ? (
                                <Button
                                  text={t("enhanceStop")}
                                  onClick={discardTranslate}
                                  size="sm"
                                />
                              ) : (
                                <>
                                  <Button
                                    text={t("enhanceDiscard")}
                                    onClick={discardTranslate}
                                    size="sm"
                                  />
                                  <Button
                                    text={t("enhanceAccept")}
                                    onClick={acceptTranslate}
                                    size="sm"
                                    kind="primary"
                                  />
                                </>
                              )}
                            </Box>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>

                <Box
                  display="grid"
                  gap="10px"
                  alignItems="start"
                  styles={{
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(120px, 1fr))",
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
                    label={`${t("calories")} (kcal)`}
                    format="number"
                    value={row.calories}
                    onChange={(v) => update(row.key, { calories: v })}
                  />
                  <TextInput
                    label={t("maxQuantity")}
                    format="number"
                    value={row.max_quantity}
                    onChange={(v) => update(row.key, { max_quantity: v })}
                  />
                </Box>
              </Box>
            </Box>
          </Card>
        );
      })}
    </Box>
  );
}
