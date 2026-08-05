"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AdminEntityList } from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { listEvents, deleteEvent, updateEvent } from "@/lib/admin-api";
import { formatEventRange } from "@/lib/event-shared";
import type { Event } from "@/lib/events";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";

/**
 * The events list.
 *
 * ⚠ **No drag-to-reorder, deliberately** - unlike every sibling content list.
 * An event is ordered by when it happens, and `Event` carries no `sort_order`
 * for exactly that reason: a hand-dragged order beside a date is a second source
 * of truth that can only ever disagree with the first. The API returns them
 * chronologically and that is the order shown.
 *
 * The list asks for every event, past ones and unpublished ones included, since
 * this is where an author goes to find both.
 */
export default function AdminEventsPage() {
  const t = useTranslations("Admin");
  const tEvents = useTranslations("Events");
  const locale = useLocale();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listEvents(systemId);
      // The list renders a formatted `when` column rather than the raw ISO
      // instant, resolved through each event's *own* timezone - the same rule
      // the public pages follow, and the reason this is done here rather than
      // left to the table.
      setItems(
        rows.map((row) => ({
          ...row,
          when: formatEventRange(row as unknown as Event, locale),
        })),
      );
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [systemId, t, locale]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleToggleEnabled = useToggleEnabled(updateEvent, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteEvent(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns = [
    { key: "image", label: t("images"), compact: true },
    { key: "name", label: t("name") },
    { key: "when", label: tEvents("whenLabel") },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("events") },
        ]}
      />
      <AdminEntityList
        title={t("events")}
        items={items}
        columns={columns}
        basePath="/admin/events"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        loading={loading}
        error={error}
      />
    </>
  );
}
