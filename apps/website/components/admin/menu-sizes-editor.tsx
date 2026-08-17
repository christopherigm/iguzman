"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
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
import { scrollToElement } from "@repo/ui/core-elements/scroll-to";
import { AdminImageUploader } from "@/components/admin-image-uploader/admin-image-uploader";

/**
 * One editable size row. `id` is present once persisted; `key` is a stable client
 * id used only for React list identity.
 *
 * `image` is the *stored* URL (for the thumbnail); `imageBase64` is a newly
 * picked file waiting to be saved and `imageCleared` records that the stored one
 * was removed. Three fields rather than one because the API's contract is
 * "omitted leaves it, blank clears it" - the parent cannot tell those apart from
 * a single nullable string.
 */
export interface MenuSizeRow {
  key: string;
  id?: number;
  name: string;
  en_name: string;
  /** How big this size is, in `unit`. Free-form; nothing is computed from it. */
  portion: string;
  unit: string;
  /** Signed: negative discounts the item's base price, positive adds to it. */
  price_delta: string;
  is_default: boolean;
  enabled: boolean;
  image: string | null;
  imageBase64?: string;
  imageCleared?: boolean;
}

/**
 * The units a *size* can be stated in - a dimension of the finished dish, not a
 * recipe portion, so the cooking measures (cup/tbsp/tsp/scoop) that
 * `menu-ingredients-editor.tsx`'s `UNIT_OPTIONS` carries are deliberately absent.
 * Mirrors `SIZE_UNIT_CHOICES` in the API's `catalog/models.py`; keep the two in
 * step.
 */
export const SIZE_UNIT_OPTIONS = [
  { value: "", label: "—" },
  { value: "in", label: "in" },
  { value: "cm", label: "cm" },
  { value: "mm", label: "mm" },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "oz", label: "oz" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
  { value: "pc", label: "pc" },
  { value: "slice", label: "slice" },
];

let rowCounter = 0;
export function newMenuSizeRow(): MenuSizeRow {
  rowCounter += 1;
  return {
    key: `size-${Date.now()}-${rowCounter}`,
    id: undefined,
    name: "",
    en_name: "",
    portion: "",
    unit: "",
    // The regular size is the base price, so a new row costs nothing extra until
    // the operator says otherwise.
    price_delta: "0.00",
    is_default: false,
    enabled: true,
    image: null,
  };
}

interface Props {
  value: MenuSizeRow[];
  onChange: (rows: MenuSizeRow[]) => void;
  /**
   * Which owner's list this is. Only the framing differs - the heading, the hint,
   * and (on an item) the enable switch and the inherited-sizes note. The rows
   * themselves are identical, which is the point of one component: a size edited
   * on a category and a size edited on a dish must not come to look or behave
   * differently.
   */
  scope: "category" | "item";
  /** `item` scope only: the dish's `sizes_enabled` switch. */
  sizesEnabled?: boolean;
  onSizesEnabledChange?: (enabled: boolean) => void;
  /**
   * `item` scope only: the names of the category's sizes, so a dish with no rows
   * of its own can say what it is inheriting instead of looking unconfigured.
   */
  inheritedSizes?: string[];
}

/**
 * The size list a dish is offered in - one editor, used on both the menu-category
 * form and the menu-item form.
 *
 * Sizes are authored per **category** (a pizzeria's pizzas come in five, its
 * drinks in two), and a dish may carry its own rows to **replace** that list
 * entirely for an edge case. "Replace, not merge" is the whole reason an override
 * is useful: it is the only rule that lets one dish *drop* a size its category
 * offers, which a merge could never do.
 *
 * Each size shifts the item's base price by a **signed** delta, so a tenant prices
 * "pizza" once at its regular size and states that small is −40 and large is +40.
 * One of them is the default the customer starts on (a radio, not a switch - a
 * dish has exactly one).
 *
 * Rows are drag-reorderable (their array order is persisted as `sort_order`).
 * Pure and controlled: it holds no persistence logic, exactly like
 * `MenuIngredientsEditor` - the parent page diffs the list against what it loaded
 * and calls create/update/delete on save.
 */
export function MenuSizesEditor({
  value,
  onChange,
  scope,
  sizesEnabled = true,
  onSizesEnabledChange,
  inheritedSizes = [],
}: Props) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollRef = useRef(false);

  const update = (key: string, patch: Partial<MenuSizeRow>) =>
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const remove = (key: string) => onChange(value.filter((r) => r.key !== key));

  /**
   * Exactly one row is the default, so picking one clears the rest here rather
   * than leaving it to the API.
   *
   * The API enforces the same thing (rows are PATCHed one at a time, so nothing
   * else could), but doing it locally is what makes the control behave like the
   * radio it is drawn as: without it the operator sees two filled radios until
   * the page is reloaded, which reads as a lost save.
   */
  const setDefault = (key: string) =>
    onChange(value.map((r) => ({ ...r, is_default: r.key === key })));

  const add = () => {
    shouldScrollRef.current = true;
    // The first size a category gets is the default, since something has to be:
    // a list where nothing is flagged silently falls back to the first row, and
    // showing that as "no default chosen" would be a lie.
    const row = newMenuSizeRow();
    onChange([...value, { ...row, is_default: value.length === 0 }]);
  };

  useEffect(() => {
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    scrollToElement(listEndRef, { block: "nearest" });
  }, [value.length]);

  // Drag-to-reorder: the handle starts the drag; each card is a drop target.
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

  const isItem = scope === "item";
  // On a dish, the rows only mean anything while sizes are on at all - and an
  // empty list is not "unconfigured", it is "inherit the category's".
  const inheriting = isItem && value.length === 0;

  return (
    <Box display="flex" flexDirection="column" gap="12px">
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap="12px"
        flexWrap="wrap"
      >
        <Typography variant="h6">{t("sizes")}</Typography>
        <Box display="flex" alignItems="center" gap="12px" flexWrap="wrap">
          {isItem && onSizesEnabledChange && (
            <Box display="flex" alignItems="center" gap="8px">
              <Switch
                checked={sizesEnabled}
                onChange={onSizesEnabledChange}
                aria-label={t("sizesEnabled")}
              />
              <Typography variant="caption">{t("sizesEnabled")}</Typography>
            </Box>
          )}
          <Box display="flex" alignItems="center" gap="8px">
            <Switch
              checked={sortMode}
              onChange={setSortMode}
              aria-label={t("sortSizes")}
            />
            <Typography variant="caption">{t("sortSizes")}</Typography>
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
        {isItem ? t("sizesHintItem") : t("sizesHintCategory")}
      </Typography>

      {/* A dish with no rows of its own is inheriting, not unconfigured - so it
          says what it is inheriting rather than "no sizes yet", which would send
          an operator off to add five rows the category already defines. */}
      {inheriting && (
        <Typography variant="caption" color="var(--muted, #6b7280)">
          {inheritedSizes.length > 0
            ? t("sizesInherited", { names: inheritedSizes.join(", ") })
            : t("sizesInheritedNone")}
        </Typography>
      )}

      {!isItem && value.length === 0 && (
        <Typography variant="caption" color="var(--muted, #6b7280)">
          {t("noSizes")}
        </Typography>
      )}

      {/* One card per size, two-up from `sm`. */}
      <Grid container spacing={1.5}>
        {value.map((row, index) => {
          const isOver = dragOverIndex === index && dragIndex !== index;
          // No `id` yet means this row has never been saved; flag it the way the
          // ingredients editor does so an operator can see what is pending.
          const isUnsaved = row.id === undefined;
          const baseBorder = isOver
            ? "1px solid var(--accent, #06b6d4)"
            : "1px solid var(--border, #e5e7eb)";
          // Always emit `borderBottom`, never conditionally drop it: a shorthand
          // `border` plus a disappearing longhand is React's shorthand conflict
          // warning.
          const bottomBorder = isUnsaved
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
                {/* Row 1 (edit mode only): the default radio and the enabled
                    switch, with delete on the right. Hidden in sort mode, where
                    the card collapses to the name + drag handle. */}
                {!sortMode && (
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    gap="12px"
                    flexWrap="wrap"
                  >
                    <Box display="flex" alignItems="center" gap="16px">
                      {/* A radio, not a switch: a dish has exactly one default
                          size, and a row of switches invites turning two on. Its
                          own `aria-label` names it, so it needs no `<label>`
                          wrapper - which `Box` could not render anyway. */}
                      <Box display="flex" alignItems="center" gap="8px">
                        <input
                          type="radio"
                          checked={row.is_default}
                          onChange={() => setDefault(row.key)}
                          // One group per editor instance, so the category's list
                          // and a dish's override never share a selection.
                          name={`menu-size-default-${scope}`}
                          aria-label={t("defaultSize")}
                        />
                        <Typography variant="caption">
                          {t("defaultSize")}
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap="8px">
                        <Switch
                          checked={row.enabled}
                          onChange={(c) => update(row.key, { enabled: c })}
                          aria-label={t("enabled")}
                        />
                        <Typography variant="caption">
                          {t("enabled")}
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

                {/* Row 2: the name pair, beside the drag handle in sort mode. */}
                <Box display="flex" alignItems="center" gap="8px">
                  {sortMode && (
                    <MoveHandle
                      onDragStart={() => setDragIndex(index)}
                      onDragEnd={handleDragEnd}
                      aria-label={t("sortSizes")}
                    />
                  )}
                  <Box flex="1" display="flex" flexDirection="column" gap="6px">
                    <TextInput
                      label={t("sizeName")}
                      value={row.name}
                      onChange={(v) => update(row.key, { name: v })}
                      minWidth={0}
                    />
                  </Box>
                </Box>

                {!sortMode && (
                  <>
                    <TextInput
                      label={t("sizeEnName")}
                      value={row.en_name}
                      onChange={(v) => update(row.key, { en_name: v })}
                      minWidth={0}
                    />

                    {/* Measurement + price delta. `auto-fit` rather than a fixed
                        column count so the three fields collapse to one column
                        inside a narrow card with no media query. */}
                    <Box
                      display="grid"
                      gap="10px"
                      alignItems="start"
                      styles={{
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(110px, 1fr))",
                      }}
                    >
                      <TextInput
                        label={t("sizePortion")}
                        type="number"
                        value={row.portion}
                        onChange={(v) => update(row.key, { portion: v })}
                        minWidth={0}
                      />
                      <Select
                        label={t("sizeUnit")}
                        value={row.unit}
                        onChange={(v) => update(row.key, { unit: v })}
                        options={SIZE_UNIT_OPTIONS}
                        minWidth={0}
                      />
                      <TextInput
                        label={t("sizePriceDelta")}
                        type="number"
                        value={row.price_delta}
                        onChange={(v) => update(row.key, { price_delta: v })}
                        minWidth={0}
                      />
                    </Box>

                    <Box display="flex" flexDirection="column" gap="6px">
                      <Typography variant="label" color="var(--foreground)">
                        {t("image")}
                      </Typography>
                      {/* `compact` is the uploader's single-image mode - a square
                          dropzone that fits beside the fields rather than the
                          full-width gallery strip. */}
                      <AdminImageUploader
                        compact
                        maxImages={1}
                        existingImages={
                          row.image
                            ? [{ id: row.id ?? 0, url: row.image }]
                            : []
                        }
                        onChange={(newImages, _deleted, orderedExisting) => {
                          const picked = newImages[0];
                          update(row.key, {
                            imageBase64: picked?.base64,
                            // The API leaves an omitted image alone and clears a
                            // blank one, so "the operator removed the stored
                            // picture" has to be recorded as its own fact.
                            imageCleared:
                              !picked &&
                              Boolean(row.image) &&
                              orderedExisting.length === 0,
                          });
                        }}
                      />
                    </Box>
                  </>
                )}
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <div ref={listEndRef} />

      {pendingDelete !== null && (
        <ConfirmationModal
          title={t("deleteSizeTitle")}
          text={t("deleteSizeText")}
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
          okCallback={() => {
            remove(pendingDelete);
            setPendingDelete(null);
          }}
          cancelCallback={() => setPendingDelete(null)}
        />
      )}
    </Box>
  );
}

/**
 * Write the editor's list back, reconciling the ids the API assigns.
 *
 * Shared by both forms, and not just to save a few lines: the reconciliation is
 * the subtle part. A freshly created row has to carry its new `id` into the
 * component's state, or a second save re-POSTs it and the operator ends up with
 * every size twice. Returns the rows as they now stand plus the ids that survived,
 * which the caller stores as its new "originals" baseline.
 *
 * Deletes run first, so re-using a name that was just freed cannot collide.
 */
export async function persistMenuSizes(
  rows: MenuSizeRow[],
  originalIds: number[],
  api: {
    create: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
    update: (id: number, payload: Record<string, unknown>) => Promise<unknown>;
    remove: (id: number) => Promise<unknown>;
  },
): Promise<{ rows: MenuSizeRow[]; ids: number[] }> {
  const currentIds = rows
    .map((r) => r.id)
    .filter((n): n is number => typeof n === "number");
  for (const id of originalIds.filter((oid) => !currentIds.includes(oid))) {
    await api.remove(id).catch(() => null);
  }

  const reconciled: MenuSizeRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    // A size with no name is a row the operator started and left; keep it in
    // state (so their typing is not thrown away) but never persist it - `name` is
    // required on the model and the API would refuse it anyway.
    if (!row.name.trim()) {
      reconciled.push(row);
      continue;
    }
    const payload = toMenuSizePayload(row, i);
    if (row.id) {
      await api.update(row.id, payload).catch(() => null);
      // The picture is saved now, so a second save must not re-send it (nor read
      // the stale "cleared" flag as a fresh instruction to clear it again).
      reconciled.push({ ...row, imageBase64: undefined, imageCleared: false });
    } else {
      const created = await api.create(payload).catch(() => null);
      const newId = created?.id;
      // A failed create leaves the row without an id and it is retried next save.
      reconciled.push(
        typeof newId === "number"
          ? {
              ...row,
              id: newId,
              image: (created?.image as string | null) ?? row.image,
              imageBase64: undefined,
              imageCleared: false,
            }
          : row,
      );
    }
  }

  return {
    rows: reconciled,
    ids: reconciled
      .map((r) => r.id)
      .filter((n): n is number => typeof n === "number"),
  };
}

/** Map an API size row onto an editor row. Shared by both forms so the two cannot
 *  disagree about which fields are strings and which are numbers. */
export function toMenuSizeRow(row: Record<string, unknown>): MenuSizeRow {
  return {
    key: `size-existing-${row.id}`,
    id: row.id as number,
    name: String(row.name ?? ""),
    en_name: String(row.en_name ?? ""),
    portion: row.portion == null ? "" : String(row.portion),
    unit: String(row.unit ?? ""),
    price_delta: String(row.price_delta ?? "0.00"),
    is_default: Boolean(row.is_default),
    enabled: row.enabled !== false,
    image: (row.image as string | null) ?? null,
  };
}

/** The write payload for one editor row, at list position `index`.
 *
 *  `image` follows the API's "omitted leaves it, blank clears it" contract, which
 *  is why it is only present when something actually happened to the picture. */
export function toMenuSizePayload(
  row: MenuSizeRow,
  index: number,
): Record<string, unknown> {
  return {
    name: row.name,
    en_name: row.en_name || null,
    portion: row.portion === "" ? null : row.portion,
    unit: row.unit || null,
    price_delta: row.price_delta === "" ? "0.00" : row.price_delta,
    is_default: row.is_default,
    enabled: row.enabled,
    sort_order: index,
    ...(row.imageBase64
      ? { image: row.imageBase64 }
      : row.imageCleared
        ? { image: null }
        : {}),
  };
}
