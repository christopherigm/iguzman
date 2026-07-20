"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AdminEntityList,
  CellText,
  EmptyCell,
} from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { listMenuItems, deleteMenuItem, updateMenuItem } from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

export default function AdminMenuItemsPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listMenuItems(systemId));
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t, systemId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleToggleEnabled = useToggleEnabled(
    updateMenuItem,
    setItems,
    setError,
  );
  const handleReorder = useReorder(updateMenuItem, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteMenuItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns = [
    { key: "image", label: t("image") ?? "Image", compact: true },
    { key: "name", label: t("name") },
    {
      key: "price",
      label: t("price") ?? "Price",
      render: (v: unknown, row: Record<string, unknown>) =>
        v != null ? (
          <CellText>{`${v} ${row.currency ?? ""}`}</CellText>
        ) : (
          <EmptyCell />
        ),
    },
    { key: "is_available", label: t("available") ?? "Available" },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("menuItems") },
        ]}
      />
      <AdminEntityList
        title={t("menuItems")}
        items={items}
        columns={columns}
        basePath="/admin/menu-items"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        loading={loading}
        error={error}
      />
    </>
  );
}
