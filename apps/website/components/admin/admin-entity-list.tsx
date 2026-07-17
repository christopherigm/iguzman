"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import "./admin-entity-list.css";
import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { Badge } from "@repo/ui/core-elements/badge";
import { Switch } from "@repo/ui/core-elements/switch";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";

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
  onDelete?: (id: number) => void;
  /**
   * Enables the inline Enabled toggle: the `enabled` column renders a Switch that
   * publishes/unpublishes the record on the spot. Must **reject** when the write
   * fails, so the Switch can roll its optimistic state back.
   */
  onToggleEnabled?: (id: number, enabled: boolean) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  /**
   * Hides the "+ New Item" button. Use for entities that cannot be created from
   * the CMS (e.g. users, who self-register) - the shared `[id]` form for those
   * is edit-only, so a "new" link would route to a non-existent record.
   */
  hideCreate?: boolean;
}

export function AdminEntityList({
  title,
  items,
  columns,
  basePath,
  onDelete,
  onToggleEnabled,
  loading,
  error,
  hideCreate,
}: AdminEntityListProps) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  // The row awaiting delete confirmation; null when the modal is closed.
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

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
        {!hideCreate && (
          <Link href={`${basePath}/new`} prefetch>
            <Button text={`+ ${t("newItem")}`} kind="primary" size="md" />
          </Link>
        )}
      </Box>

      {loading && (
        <Box
          padding="32px 16px"
          borderRadius={8}
          backgroundColor="color-mix(in srgb, var(--foreground) 3%, transparent)"
          color="color-mix(in srgb, var(--foreground) 60%, transparent)"
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
          color="color-mix(in srgb, var(--foreground) 60%, transparent)"
          styles={{ textAlign: "center" }}
        >
          <Typography variant="body">{t("noItems")}</Typography>
        </Box>
      )}

      {!loading && !error && items.length > 0 && (
        <Box
          borderRadius={8}
          styles={{
            overflowX: "auto",
            border:
              "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
          }}
        >
          <table className="ael__table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`ael__th${col.compact ? " ael__th--compact" : ""}`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="ael__th ael__th--actions">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item.id)} className="ael__row">
                  {columns.map((col) => (
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
                    <Box display="flex" gap={8} justifyContent="center">
                      <Link href={`${basePath}/${item.id}`} prefetch>
                        <Button text={t("edit")} size="sm" />
                      </Link>
                      {onDelete && (
                        <Button
                          text={t("delete")}
                          size="sm"
                          kind="error"
                          onClick={() => setPendingDelete(item.id as number)}
                        />
                      )}
                    </Box>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}

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
    <Typography
      as="span"
      variant="body"
      color="color-mix(in srgb, var(--foreground) 35%, transparent)"
    >
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
