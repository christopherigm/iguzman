"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { MoveHandle } from "@repo/ui/core-elements/move-handle";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { useLlmProxy, type LlmMessage } from "@repo/ui/use-llm";
import "./menu-ingredients-editor.css";

/** One editable ingredient row. `id` is present once persisted; `key` is a
 *  stable client id used only for React list identity.
 *
 *  Identity (name/image) and nutrition now live on the referenced reusable
 *  Ingredient (`ingredient` holds its id), so this row only carries the recipe
 *  *portion* and *pricing*. Calories are computed by the API from the chosen
 *  ingredient scaled to `quantity`/`unit`. */
/** One *alternative* ingredient in a single-select choice group. Its `price` is
 *  the per-unit up-charge when this option is chosen; the recipe portion is the
 *  parent row's shared `quantity`/`unit`. `key` is a stable client id. */
export interface IngredientOptionRow {
  key: string;
  /** The referenced reusable Ingredient's id ("" until one is picked). */
  ingredient: number | "";
  price: string;
}

export interface IngredientRow {
  key: string;
  id?: number;
  /** The referenced reusable Ingredient's id ("" until one is picked). This is
   *  the group's *default* option; `options` holds the alternatives. */
  ingredient: number | "";
  /** Customer-facing label for the choice group (e.g. "Sweetener"), shown as the
   *  heading above the choice chips. Only used when `options` is non-empty. */
  group_name: string;
  group_en_name: string;
  price: string;
  quantity: string;
  unit: string;
  /**
   * `false` = included by default (locked, in the base price); `true` = an
   * optional add-on the customer adds up to `max_quantity`, each unit charged.
   */
  is_removable: boolean;
  /**
   * Internal recipe-only component: hidden from the customer customiser and
   * excluded from pricing, but still counted in the public nutrition label.
   */
  is_internal: boolean;
  max_quantity: string;
  /** Units the customer gets free before `price` applies (removable add-ons). */
  number_of_free_portions: string;
  /** Quantity pre-selected for the customer in the stepper (removable add-ons). */
  default_quantity: string;
  enabled: boolean;
  /** Alternative ingredients for a single-select choice group (empty = plain
   *  single-ingredient row). Each carries its own per-unit up-charge. */
  options: IngredientOptionRow[];
}

/** The subset of an Ingredient the picker needs to render options + a hint. */
export interface IngredientOption {
  id: number;
  name: string | null;
  en_name: string | null;
  /** Thumbnail URL so the row can show the picked ingredient at a glance. */
  image: string | null;
  unit: string;
  nutrition_basis_quantity: string | null;
  calories: string | null;
  /** Purchasing price per `nutrition_basis_quantity` of `unit`, or null when the
   *  ingredient is unpriced; `currency` is the currency that price is in. Used to
   *  estimate the menu item's ingredient cost. */
  price: string | null;
  currency: string;
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
    group_name: "",
    group_en_name: "",
    price: "0.00",
    quantity: "",
    unit: "",
    // New rows default to included-by-default (part of the base recipe); flip
    // "Removable" on to make it a customer-chosen add-on.
    is_removable: false,
    is_internal: false,
    max_quantity: "1",
    number_of_free_portions: "0",
    default_quantity: "0",
    enabled: true,
    options: [],
  };
}

let optionCounter = 0;
export function newIngredientOptionRow(): IngredientOptionRow {
  optionCounter += 1;
  return {
    key: `opt-${Date.now()}-${optionCounter}`,
    ingredient: "",
    price: "0.00",
  };
}

interface Props {
  value: IngredientRow[];
  onChange: (rows: IngredientRow[]) => void;
  /** The tenant's reusable ingredient catalog, for the picker. */
  catalog: IngredientOption[];
}

/** A 40×40 rounded thumbnail of the picked ingredient (blank placeholder when
 *  none is chosen yet). Shared by the default row and each alternative option so
 *  every ingredient shows its image. */
function IngredientThumb({ image }: { image: string | null }) {
  return (
    <Box
      width={40}
      height={40}
      flex="0 0 auto"
      borderRadius={8}
      backgroundColor="var(--surface-2)"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {image && (
        <Image
          src={image}
          alt=""
          fill
          sizes="40px"
          style={{ objectFit: "cover" }}
        />
      )}
    </Box>
  );
}

/** Translate a group name between the two languages. Mirrors `admin-form.tsx`'s
 *  translate prompts so the CMS reads consistently: ES→EN and EN→ES, text only. */
function buildGroupTranslateMessages(
  text: string,
  source: "es" | "en",
): LlmMessage[] {
  if (source === "en") {
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

/**
 * The choice-group name pair (ES + EN) with a per-field AI translate button.
 *
 * A self-contained slice of `admin-form.tsx`'s translate flow, scoped to one
 * ingredient row: each field's button streams a translation of its own value
 * into a preview, which the user accepts into the *other* language or discards.
 * Its own `useLlmProxy` instance keeps each row's generation independent.
 */
function GroupNameFields({
  groupName,
  groupEnName,
  onChange,
}: {
  groupName: string;
  groupEnName: string;
  onChange: (patch: Partial<IngredientRow>) => void;
}) {
  const t = useTranslations("Admin");
  // `streamingText` is the live preview (it holds the full translation once the
  // stream ends, and `reset`/`abort` clear it), so no mirrored state is needed.
  const { streamingText, isGenerating, generate, abort, reset } = useLlmProxy({
    temperature: 0.3,
  });
  // Which field is being translated ("es" = group_name, "en" = group_en_name).
  const [active, setActive] = useState<"es" | "en" | null>(null);

  const translate = async (source: "es" | "en") => {
    const text = (source === "es" ? groupName : groupEnName).trim();
    if (!text) return;
    setActive(source);
    reset();
    await generate(buildGroupTranslateMessages(text, source));
  };

  const accept = () => {
    if (active && streamingText) {
      onChange(
        active === "es"
          ? { group_en_name: streamingText }
          : { group_name: streamingText },
      );
    }
    setActive(null);
    reset();
  };

  const discard = () => {
    if (isGenerating) abort();
    setActive(null);
    reset();
  };

  const field = (source: "es" | "en") => {
    const value = source === "es" ? groupName : groupEnName;
    const key = source === "es" ? "group_name" : "group_en_name";
    return (
      <Box display="flex" flexDirection="column" gap="6px">
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          minHeight={24}
        >
          <Typography variant="label" color="var(--foreground)">
            {source === "es" ? t("groupName") : t("groupEnName")}
          </Typography>
          <Button
            icon="/icons/translate.svg"
            iconSize="16px"
            iconColor={
              active === source
                ? "var(--accent, #06b6d4)"
                : "var(--foreground, #171717)"
            }
            disabled={isGenerating || !value.trim()}
            onClick={() => translate(source)}
            aria-label={t("translateLabel")}
            title={t("translateLabel")}
            type="button"
          />
        </Box>
        <TextInput
          value={value}
          onChange={(v) => onChange({ [key]: v } as Partial<IngredientRow>)}
          minWidth={0}
        />
      </Box>
    );
  };

  return (
    <Box display="flex" flexDirection="column" gap="10px">
      <Box
        display="grid"
        gap="10px"
        alignItems="start"
        styles={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
      >
        {field("es")}
        {field("en")}
      </Box>

      {/* Translate preview: accept writes it into the other language, discard
          (or stop, mid-stream) drops it. */}
      {active && (
        <Box
          display="flex"
          flexDirection="column"
          gap="10px"
          padding="12px 14px"
          borderRadius={8}
          border="1px solid var(--border, #e5e7eb)"
          backgroundColor="var(--surface-2)"
        >
          <Typography variant="body" margin={0}>
            {streamingText || "…"}
          </Typography>
          <Box display="flex" alignItems="center" gap="8px">
            {isGenerating ? (
              <Button
                text={t("enhanceStop")}
                onClick={discard}
                size="sm"
                type="button"
              />
            ) : (
              <>
                <Button
                  text={t("enhanceDiscard")}
                  onClick={discard}
                  size="sm"
                  type="button"
                />
                <Button
                  text={t("enhanceAccept")}
                  onClick={accept}
                  kind="primary"
                  size="sm"
                  type="button"
                />
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * Editor for a menu item's priced ingredients (base price + add-on deltas).
 *
 * Each row picks one reusable Ingredient from the tenant catalog, then sets the
 * recipe portion and pricing. "Removable" off means the ingredient is included
 * by default (locked, in the base price); on makes it an optional add-on where
 * `price` is the up-charge per unit and `max_quantity` caps how many the
 * customer may add (2 = "double"). Rows are drag-reorderable (their array order
 * is persisted as `sort_order`), and "Add ingredient" appends a fresh row at the
 * end (scrolling it into view). Pure/controlled - it holds no persistence logic; the parent page diffs
 * the list against the loaded rows and calls the create/update/delete API on
 * save.
 */
export function MenuIngredientsEditor({ value, onChange, catalog }: Props) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Sort mode strips each card down to image + picker + drag handle so rows are
  // easy to re-arrange; the move handle is hidden entirely when it is off.
  const [sortMode, setSortMode] = useState(false);
  // Key of the row awaiting delete confirmation (null = no modal open).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Sentinel at the end of the list + a one-shot flag so we only scroll after an
  // "Add ingredient" click, not on every re-render (edits, reorders, deletes).
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollRef = useRef(false);

  const update = (key: string, patch: Partial<IngredientRow>) =>
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const remove = (key: string) => onChange(value.filter((r) => r.key !== key));

  // Choice-group option mutations, all keyed by the parent row + option key.
  const addOption = (rowKey: string) =>
    onChange(
      value.map((r) =>
        r.key === rowKey
          ? { ...r, options: [...r.options, newIngredientOptionRow()] }
          : r,
      ),
    );

  const updateOption = (
    rowKey: string,
    optKey: string,
    patch: Partial<IngredientOptionRow>,
  ) =>
    onChange(
      value.map((r) =>
        r.key === rowKey
          ? {
              ...r,
              options: r.options.map((o) =>
                o.key === optKey ? { ...o, ...patch } : o,
              ),
            }
          : r,
      ),
    );

  const removeOption = (rowKey: string, optKey: string) =>
    onChange(
      value.map((r) =>
        r.key === rowKey
          ? { ...r, options: r.options.filter((o) => o.key !== optKey) }
          : r,
      ),
    );

  // New rows go to the end of the list; the effect below scrolls the freshly
  // added row into view once it has rendered.
  const add = () => {
    shouldScrollRef.current = true;
    onChange([...value, newIngredientRow()]);
  };

  useEffect(() => {
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    listEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [value.length]);

  // A short "62 kcal per 1 pc" hint for a catalog ingredient, shown in
  // parentheses after its name in the picker.
  const basisHintFor = (picked: IngredientOption): string | null => {
    const parts: string[] = [];
    if (picked.calories != null && picked.calories !== "")
      parts.push(`${Number(picked.calories)} kcal`);
    parts.push(
      `${t("nutritionPer") ?? "per"} ${Number(
        picked.nutrition_basis_quantity ?? "0",
      )} ${picked.unit}`,
    );
    return parts.join(" ") || null;
  };

  const catalogOptions = [
    { value: "", label: t("selectIngredient") ?? "— Select —" },
    ...catalog.map((c) => {
      const name = String(c.name ?? c.en_name ?? c.id);
      const hint = basisHintFor(c);
      return {
        value: String(c.id),
        label: hint ? `${name} (${hint})` : name,
      };
    }),
  ];

  // Thumbnail url for a picked ingredient id ("" until one is chosen).
  const imageFor = (ingredient: number | ""): string | null =>
    catalog.find((c) => c.id === ingredient)?.image ?? null;

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
        <Typography variant="h6">{t("ingredients")}</Typography>
        <Box display="flex" alignItems="center" gap="12px">
          <Box display="flex" alignItems="center" gap="8px">
            <Switch
              checked={sortMode}
              onChange={setSortMode}
              aria-label={t("sortIngredients")}
            />
            <Typography variant="caption">{t("sortIngredients")}</Typography>
          </Box>
          <Button
            text={t("addShort")}
            kind="primary"
            size="sm"
            onClick={add}
            type="button"
          />
        </Box>
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
          // Rows carry an `id` only once persisted; a missing id means this
          // ingredient is new and not yet saved - flag it with a green underline.
          const isUnsaved = row.id === undefined;
          const pickedImage =
            catalog.find((c) => c.id === row.ingredient)?.image ?? null;
          // Base four-side border (accent while a drop hovers this card).
          const baseBorder = isOver
            ? "1px solid var(--accent, #06b6d4)"
            : "1px solid var(--border, #e5e7eb)";
          // Bottom edge doubles as a status flag: purple for an internal
          // (kitchen-only) row, green for an unsaved one, else the base border.
          // Always emit `borderBottom` so it's never *removed* on rerender - a
          // shorthand `border` plus a disappearing `borderBottom` is what
          // triggers React's shorthand/longhand conflict warning.
          const bottomBorder = row.is_internal
            ? "3px solid var(--internal, #9333ea)"
            : isUnsaved
              ? "3px solid var(--success, #16a34a)"
              : baseBorder;
          return (
            <Grid key={row.key} size={{ xs: 12, sm: 6 }}>
              <Card
                gap="10px"
                border={baseBorder}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnter={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, index)}
                styles={{
                  opacity: dragIndex === index ? 0.5 : 1,
                  overflow: "visible",
                  borderBottom: bottomBorder,
                }}
              >
                {/* Row 1 (edit mode only): the Removable + Internal switches
                and the delete button share one row at every breakpoint. Hidden
                in sort mode, where the card collapses to just the picker +
                inline drag handle. */}
                {!sortMode && (
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    gap="12px"
                  >
                    <Box display="flex" alignItems="center" gap="16px">
                      <Box display="flex" alignItems="center" gap="8px">
                        <Switch
                          checked={row.is_removable}
                          onChange={(c) => update(row.key, { is_removable: c })}
                          aria-label={t("removable")}
                        />
                        <Typography variant="caption">
                          {t("removable")}
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap="8px">
                        <Switch
                          checked={row.is_internal}
                          onChange={(c) => update(row.key, { is_internal: c })}
                          aria-label={t("internal")}
                        />
                        <Typography variant="caption">
                          {t("internal")}
                        </Typography>
                      </Box>
                    </Box>
                    <IconButton
                      icon="/icons/delete-trash-icon.svg"
                      kind="error"
                      size="sm"
                      aria-label={t("remove")}
                      title={t("remove")}
                      onClick={() => setPendingDelete(row.key)}
                      type="button"
                    />
                  </Box>
                )}

                {/* Group name: once there are alternatives, name the choice so the
                customer knows what they are picking (e.g. "Sweetener"). Sits above
                the default picker as the group's heading, with per-field AI
                translation; hidden for a plain single-ingredient row. */}
                {!sortMode && row.options.length > 0 && (
                  <GroupNameFields
                    groupName={row.group_name}
                    groupEnName={row.group_en_name}
                    onChange={(patch) => update(row.key, patch)}
                  />
                )}

                {/* Row 2: a thumbnail of the picked ingredient beside the picker
                (with a nutrition-basis hint), above the portion + pricing fields. */}
                <Box display="flex" flexDirection="column" gap="6px">
                  <Box display="flex" alignItems="center" gap="8px">
                    <IngredientThumb image={pickedImage} />
                    <Box flex="1">
                      <Select
                        label={t("ingredient")}
                        value={
                          row.ingredient === "" ? "" : String(row.ingredient)
                        }
                        onChange={(v) =>
                          update(row.key, {
                            ingredient: v === "" ? "" : Number(v),
                          })
                        }
                        options={catalogOptions}
                      />
                    </Box>
                    {/* The up-charge always sits inline beside the picker, both
                    for a plain row and for the default of a choice group (where
                    it mirrors each alternative's own up-charge). */}
                    {!sortMode && (
                      <Box width={80} flex="0 0 auto">
                        <TextInput
                          label={t("upcharge")}
                          format="number"
                          value={row.price}
                          onChange={(v) => update(row.key, { price: v })}
                          minWidth={0}
                        />
                      </Box>
                    )}
                    {/* Add a single-select alternative below this default picker
                    (e.g. Organic sugar / Splenda beside the default Refined). */}
                    {!sortMode && (
                      <IconButton
                        icon="/icons/add.svg"
                        kind="primary"
                        size="sm"
                        aria-label={t("addOption")}
                        title={t("addOption")}
                        onClick={() => addOption(row.key)}
                        type="button"
                      />
                    )}
                    {/* The move handle sits inline with the picker; it doubles
                    as the drag source and is only shown in sort mode. */}
                    {sortMode && (
                      // 40px tall rather than the size token's 36, so it lines
                      // up with the Select it sits beside.
                      <MoveHandle
                        height={40}
                        onDragStart={() => handleDragStart(index)}
                        onDragEnd={handleDragEnd}
                        aria-label={t("dragToReorder")}
                        title={t("dragToReorder")}
                      />
                    )}
                  </Box>
                </Box>

                {/* Single-select alternatives: each is another ingredient the
                customer may swap in for the default, with its own up-charge and a
                delete button. The shared portion/pricing fields below apply to all. */}
                {!sortMode && row.options.length > 0 && (
                  <Box display="flex" flexDirection="column" gap="8px">
                    {row.options.map((opt) => (
                      <Box
                        key={opt.key}
                        display="flex"
                        alignItems="center"
                        gap="8px"
                      >
                        <IngredientThumb image={imageFor(opt.ingredient)} />
                        <Box flex="1">
                          <Select
                            label={t("optionIngredient")}
                            value={
                              opt.ingredient === ""
                                ? ""
                                : String(opt.ingredient)
                            }
                            onChange={(v) =>
                              updateOption(row.key, opt.key, {
                                ingredient: v === "" ? "" : Number(v),
                              })
                            }
                            options={catalogOptions}
                          />
                        </Box>
                        <Box width={80} flex="0 0 auto">
                          <TextInput
                            label={t("upcharge")}
                            format="number"
                            value={opt.price}
                            onChange={(v) =>
                              updateOption(row.key, opt.key, { price: v })
                            }
                            minWidth={0}
                          />
                        </Box>
                        <IconButton
                          icon="/icons/delete-trash-icon.svg"
                          kind="error"
                          size="sm"
                          aria-label={t("remove")}
                          title={t("remove")}
                          onClick={() => removeOption(row.key, opt.key)}
                          type="button"
                        />
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Portion + quantity fields. Two rows on xs (portion/unit,
                then the three quantities), one row from sm - see the companion
                CSS for the column tracks. */}
                {!sortMode && (
                  <Box
                    display="grid"
                    gap="10px"
                    alignItems="start"
                    className="mie__fields"
                  >
                    <TextInput
                      className="mie__field--wide"
                      label={t("portion")}
                      format="number"
                      value={row.quantity}
                      onChange={(v) => update(row.key, { quantity: v })}
                    />
                    <Select
                      className="mie__field--wide"
                      label={t("unit")}
                      value={row.unit}
                      onChange={(v) => update(row.key, { unit: v })}
                      options={UNIT_OPTIONS}
                    />
                    <TextInput
                      className="mie__field--qty"
                      label={t("defaultQuantity")}
                      format="number"
                      value={row.default_quantity}
                      onChange={(v) => update(row.key, { default_quantity: v })}
                    />
                    <TextInput
                      className="mie__field--qty"
                      label={t("freePortions")}
                      format="number"
                      value={row.number_of_free_portions}
                      onChange={(v) =>
                        update(row.key, { number_of_free_portions: v })
                      }
                    />
                    <TextInput
                      className="mie__field--qty"
                      label={t("maxQuantity")}
                      format="number"
                      value={row.max_quantity}
                      onChange={(v) => update(row.key, { max_quantity: v })}
                    />
                  </Box>
                )}
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Scroll anchor: `add` scrolls this into view so the new last row shows. */}
      <Box ref={listEndRef} height={0} aria-hidden={true} />

      {pendingDelete !== null && (
        <ConfirmationModal
          title={t("deleteIngredientTitle")}
          text={t("deleteIngredientText")}
          okCallback={() => {
            remove(pendingDelete);
            setPendingDelete(null);
          }}
          cancelCallback={() => setPendingDelete(null)}
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
        />
      )}
    </Box>
  );
}
