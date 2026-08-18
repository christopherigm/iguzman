"use client";

import { useId, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@repo/i18n/navigation";
import "./admin-entity-list.css";
import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { MoveHandle } from "@repo/ui/core-elements/move-handle";
import { Badge } from "@repo/ui/core-elements/badge";
import { Icon } from "@repo/ui/core-elements/icon";
import { Switch } from "@repo/ui/core-elements/switch";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  buildSections,
  groupKeyOf,
  type EntityGroup,
  type EntityGrouping,
  type IndexedRow,
} from "./entity-order";

// Re-exported so the list pages keep importing the grouping types from the
// component they configure; the ordering itself lives in `entity-order.ts`,
// which the detail pages' prev/next arrows read too.
export type { EntityGroup, EntityGrouping };

export interface Column {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  /**
   * Size the column to its content rather than letting the table stretch it.
   * Use for image/icon columns, whose cell is a fixed-size square.
   */
  compact?: boolean;
}

interface AdminEntityListProps {
  title: string;
  items: Record<string, unknown>[];
  columns: Column[];
  basePath: string;
  /**
   * Splits the table into one collapsible section per group instead of listing
   * every record together. Only takes effect once the rows actually fall into
   * more than one section - a list whose records all share a category has
   * nothing to group, so it stays the plain single table.
   */
  grouping?: EntityGrouping;
  onDelete?: (id: number) => void;
  /**
   * Enables the inline Enabled toggle: the `enabled` column renders a Switch that
   * publishes/unpublishes the record on the spot. Must **reject** when the write
   * fails, so the Switch can roll its optimistic state back.
   */
  onToggleEnabled?: (id: number, enabled: boolean) => Promise<void>;
  /**
   * Enables sort mode: a Switch above the table strips every row down to its
   * image, name and a drag handle so the list can be re-arranged. Called with
   * the rows in their new order when the switch is turned back off, and must
   * persist each row's new `sort_order`. Omit for lists that have no manual
   * order (e.g. users).
   */
  onReorder?: (ordered: Record<string, unknown>[]) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  /**
   * Hides the "+ New Item" button. Use for entities that cannot be created from
   * the CMS (e.g. users, who self-register) - the shared `[id]` form for those
   * is edit-only, so a "new" link would route to a non-existent record.
   */
  hideCreate?: boolean;
  /**
   * Extra controls for the header row, rendered immediately before "+ New".
   * For a page whose list is only part of what it edits: /admin/highlights puts
   * the Save button for the section's settings here, so every action on the page
   * sits in the one header row - sort, save, new - as on every other CMS list.
   */
  headerActions?: React.ReactNode;
  /**
   * A block rendered **below** the table. For a page that edits the section
   * itself as well as its records: /admin/highlights puts the section's heading
   * pair and colour band here, so the records - the reason the page is open -
   * are the first thing under the header row, and the section-wide settings sit
   * after them.
   */
  children?: React.ReactNode;
}

export function AdminEntityList({
  title,
  items,
  columns,
  basePath,
  grouping,
  onDelete,
  onToggleEnabled,
  onReorder,
  loading,
  error,
  hideCreate,
  headerActions,
  children,
}: AdminEntityListProps) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const sectionId = useId();
  // The row awaiting delete confirmation; null when the modal is closed.
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  // The sections the admin has folded away, by section key. Collapsed rather
  // than expanded keys, so every section - including a category added after the
  // page was opened - starts open.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  // Sort mode's working copy of the list. Non-null only while the switch is on:
  // dragging mutates this rather than `items`, so the parent's state stays the
  // saved order until the reorder is actually persisted.
  const [draft, setDraft] = useState<Record<string, unknown>[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const sortMode = draft !== null;
  const rows = draft ?? items;
  // In sort mode a row collapses to its image and name; the drag handle takes
  // over the actions cell. Lists without an image column simply show the name.
  const visibleColumns = sortMode
    ? columns.filter((c) => c.key === "image" || c.key === "name")
    : columns;

  // Each row keeps its index in `rows`, because that is what the drag handlers
  // splice against - a section renders a subset, never a list of its own.
  const sections = useMemo(
    () => buildSections(rows, grouping),
    [rows, grouping],
  );
  const grouped = grouping !== undefined && sections.length > 1;

  const toggleSortMode = async (next: boolean) => {
    if (next) {
      // A grouped list is dragged in the order it is *read*, so sort mode opens
      // on the flattened section order rather than the stored one. Turning the
      // switch back off therefore also brings `sort_order` into line with what
      // is on screen, which is what keeps the storefront's flat listings in the
      // same arrangement as the CMS.
      setDraft(
        grouped
          ? buildSections(items, grouping).flatMap((s) =>
              s.rows.map((r) => r.row),
            )
          : items,
      );
      return;
    }
    const ordered = draft;
    if (!ordered || !onReorder) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      await onReorder(ordered);
      setDraft(null);
    } catch {
      // The page surfaced the error; stay in sort mode so the arrangement the
      // user made is still on screen and they can retry rather than lose it.
    } finally {
      setSaving(false);
    }
  };

  // Drag-to-reorder: the handle is the drag source, each row a drop target.
  // A grouped list only accepts a drop inside the dragged row's own section: a
  // row's section is decided by its category, so a cross-section drop would
  // re-arrange nothing and simply snap the row back where it came from.
  const acceptsDrop = (index: number) => {
    if (dragIndex === null) return false;
    if (!grouped || !draft) return true;
    return (
      groupKeyOf(draft[dragIndex], grouping) ===
      groupKeyOf(draft[index], grouping)
    );
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    // No preventDefault when the drop is refused, so the cursor says so.
    if (!acceptsDrop(index)) return;
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDrop = (e: DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (
      dragIndex === null ||
      dragIndex === dropIndex ||
      !draft ||
      !acceptsDrop(dropIndex)
    ) {
      handleDragEnd();
      return;
    }
    const next = [...draft];
    const [moved] = next.splice(dragIndex, 1);
    if (moved) {
      next.splice(dropIndex, 0, moved);
      setDraft(next);
    }
    handleDragEnd();
  };

  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // The table, for one section's rows or for the whole list. Every entry carries
  // its index in `rows` rather than its position in the section, because that is
  // the index the drag handlers splice against.
  const renderTable = (entries: IndexedRow[]) => (
    <table className="ael__table">
      <thead>
        <tr>
          {visibleColumns.map((col) => (
            <th
              key={col.key}
              className={`ael__th${col.compact ? " ael__th--compact" : ""}`}
            >
              {col.label}
            </th>
          ))}
          <th className="ael__th ael__th--actions">
            {sortMode ? t("order") : t("actions")}
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map(({ row: item, index }) => (
          <tr
            key={String(item.id)}
            className={`ael__row${
              sortMode && dragOverIndex === index && dragIndex !== index
                ? " ael__row--drop"
                : ""
            }${sortMode && dragIndex === index ? " ael__row--dragging" : ""}`}
            onDragOver={sortMode ? (e) => handleDragOver(e, index) : undefined}
            onDragEnter={sortMode ? (e) => e.preventDefault() : undefined}
            onDrop={sortMode ? (e) => handleDrop(e, index) : undefined}
          >
            {visibleColumns.map((col) => (
              <td
                key={col.key}
                className={`ael__td${col.compact ? " ael__td--compact" : ""}`}
              >
                {col.render ? (
                  col.render(item[col.key], item)
                ) : onToggleEnabled && col.key === "enabled" ? (
                  <EnabledSwitch
                    id={item.id as number}
                    enabled={Boolean(item.enabled)}
                    onToggle={onToggleEnabled}
                    label={t("toggleEnabled")}
                  />
                ) : (
                  renderCell(item[col.key])
                )}
              </td>
            ))}
            <td className="ael__td ael__td--actions">
              <Box display="flex" gap={8} justifyContent="flex-end">
                {sortMode ? (
                  <MoveHandle
                    size="sm"
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={handleDragEnd}
                    aria-label={t("dragToReorder")}
                    title={t("dragToReorder")}
                  />
                ) : (
                  <>
                    <IconButton
                      icon="/icons/edit.svg"
                      kind="warning"
                      size="sm"
                      href={`${basePath}/${item.id}`}
                      aria-label={t("edit")}
                      title={t("edit")}
                    />
                    {onDelete && (
                      <IconButton
                        icon="/icons/delete-trash-icon.svg"
                        kind="error"
                        size="sm"
                        aria-label={t("delete")}
                        title={t("delete")}
                        onClick={() => setPendingDelete(item.id as number)}
                      />
                    )}
                  </>
                )}
              </Box>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Box flexDirection="column" gap={20}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={16}
        flexWrap="wrap"
        marginBottom={12}
      >
        <Typography as="h1" variant="h3" margin={0}>
          {title}
        </Typography>
        <Box display="flex" alignItems="center" gap={16} flexWrap="wrap">
          {onReorder && items.length > 1 && (
            <Box display="flex" alignItems="center" gap={8}>
              <Switch
                checked={sortMode}
                onChange={(next) => void toggleSortMode(next)}
                disabled={saving}
                aria-label={t("sortRows")}
              />
              <Typography variant="caption">{t("sortRows")}</Typography>
            </Box>
          )}
          {headerActions}
          {!hideCreate && (
            <Link href={`${basePath}/new`} prefetch>
              <Button text={`+ ${t("newItem")}`} kind="primary" size="md" />
            </Link>
          )}
        </Box>
      </Box>

      {/* Reorder persistence progress, directly under the header row. */}
      {saving && <ProgressBar />}

      {sortMode && (
        <Typography variant="caption" color="var(--muted, #6b7280)">
          {grouped ? t("sortRowsHintGrouped") : t("sortRowsHint")}
        </Typography>
      )}

      {loading && (
        <Box
          padding="32px 16px"
          borderRadius={8}
          backgroundColor="color-mix(in srgb, var(--foreground) 3%, transparent)"
          color="var(--foreground)"
          styles={{ textAlign: "center" }}
        >
          <Typography variant="body">{t("loading")}</Typography>
        </Box>
      )}

      {error && (
        <Box
          padding="32px 16px"
          borderRadius={8}
          backgroundColor="color-mix(in srgb, #e53935 8%, transparent)"
          color="#c62828"
          styles={{ textAlign: "center" }}
        >
          <Typography variant="body">{error}</Typography>
        </Box>
      )}

      {!loading && !error && items.length === 0 && (
        <Box
          padding="32px 16px"
          borderRadius={8}
          backgroundColor="color-mix(in srgb, var(--foreground) 3%, transparent)"
          color="var(--foreground)"
          styles={{ textAlign: "center" }}
        >
          <Typography variant="body">{t("noItems")}</Typography>
        </Box>
      )}

      {/* One table, when there is nothing to group by (or every record falls in
          the same section). */}
      {!loading && !error && items.length > 0 && !grouped && (
        <Box
          borderRadius={8}
          styles={{
            overflowX: "auto",
            border:
              "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
          }}
        >
          {renderTable(sections[0]?.rows ?? [])}
        </Box>
      )}

      {/* One collapsible table per group, in the groups' own order. */}
      {!loading && !error && grouped && (
        <Box flexDirection="column" gap={12}>
          {sections.map((section) => {
            const open = !collapsed.has(section.key);
            const panelId = `${sectionId}-${section.key}`;
            return (
              <Box
                key={section.key}
                borderRadius={8}
                styles={{
                  overflow: "hidden",
                  border:
                    "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
                }}
              >
                <Button
                  unstyled
                  className="ael__group"
                  onClick={() => toggleSection(section.key)}
                  aria-expanded={open}
                  aria-controls={panelId}
                >
                  <Icon
                    icon="/icons/chevron-down.svg"
                    size={16}
                    color="var(--foreground)"
                    className={`ael__group-chevron${
                      open ? "" : " ael__group-chevron--closed"
                    }`}
                  />
                  <Typography as="span" variant="h6" margin={0}>
                    {section.label}
                  </Typography>
                  {/* The row count, so a folded section still says how much is
                      inside it. Painted from `--foreground` rather than a named
                      colour, since it carries no status - unlike the ✓/✗ badge a
                      boolean cell renders. */}
                  <Badge
                    variant="subtle"
                    size="sm"
                    color="var(--foreground)"
                    circular
                  >
                    {String(section.rows.length)}
                  </Badge>
                </Button>
                {open && (
                  <Box id={panelId} styles={{ overflowX: "auto" }}>
                    {renderTable(section.rows)}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* The page's own block (e.g. the section settings a list belongs to),
          after the records so the list leads the page. */}
      {children}

      {onDelete && pendingDelete !== null && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDelete")}
          okCallback={() => {
            onDelete(pendingDelete);
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

/**
 * Inline publish/unpublish toggle for a row's `enabled` field. Flips immediately
 * and rolls back if `onToggle` rejects, so the switch never claims a write that
 * the API refused.
 */
function EnabledSwitch({
  id,
  enabled,
  onToggle,
  label,
}: {
  id: number;
  enabled: boolean;
  onToggle: (id: number, enabled: boolean) => Promise<void>;
  label: string;
}) {
  // `pending` is the optimistic value shown while the write is in flight; the row
  // is the source of truth either side of it. Clearing it on settle reverts on
  // failure and keeps the accepted value on success, with no prop/state sync.
  const [pending, setPending] = useState<boolean | null>(null);

  const handleChange = async (next: boolean) => {
    setPending(next);
    try {
      await onToggle(id, next);
    } catch {
      // The list already surfaced the error; the switch just falls back.
    } finally {
      setPending(null);
    }
  };

  return (
    <Switch
      checked={pending ?? enabled}
      onChange={(next) => void handleChange(next)}
      disabled={pending !== null}
      aria-label={label}
    />
  );
}

/**
 * Muted "empty value" placeholder for a table cell. Use in any custom `render`
 * function instead of returning a bare `"-"` string, so empty cells look the
 * same across every admin table.
 */
export function EmptyCell() {
  return (
    <Typography as="span" variant="body" color="var(--foreground)">
      -
    </Typography>
  );
}

/**
 * Standard text wrapper for a table cell. Use in any custom `render` function
 * instead of returning a raw string or bare `<span>`, so all cell text shares
 * the same Typography styling.
 */
export function CellText({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <Typography as="span" variant="body" title={title}>
      {children}
    </Typography>
  );
}

function renderCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <EmptyCell />;
  if (typeof value === "boolean") {
    return (
      <Badge variant="subtle" color={value ? "green" : "gray"}>
        {value ? "✓" : "✗"}
      </Badge>
    );
  }
  if (
    typeof value === "string" &&
    (value.startsWith("http://") || value.startsWith("https://"))
  ) {
    // Detect image URLs
    if (/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(value)) {
      return (
        <Box
          width={40}
          height={40}
          borderRadius={8}
          backgroundColor="color-mix(in srgb, var(--foreground) 8%, transparent)"
          styles={{ overflow: "hidden", flexShrink: 0 }}
        >
          <Image
            src={value}
            alt=""
            width={40}
            height={40}
            unoptimized
            style={{ objectFit: "cover" }}
          />
        </Box>
      );
    }
  }
  const text = String(value);
  const isLong = text.length > 60;
  return (
    <CellText title={isLong ? text : undefined}>
      {isLong ? `${text.slice(0, 60)}…` : text}
    </CellText>
  );
}
