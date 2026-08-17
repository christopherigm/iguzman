"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  AdminEntityList,
  CellText,
  EmptyCell,
} from "@/components/admin/admin-entity-list";
import type { EntityGroup } from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import {
  listMenuItems,
  listMenuCategories,
  deleteMenuItem,
  updateMenuItem,
} from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

export default function AdminMenuItemsPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [categories, setCategories] = useState<EntityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The categories are fetched for their **order** as much as their names:
      // the sections read in the arrangement the CMS gives the categories
      // themselves - the same order the storefront's `/categories/menu` sections
      // follow - which is the order the API already returns them in
      // (`sort_order`, then name).
      const [data, cats] = await Promise.all([
        listMenuItems(systemId),
        listMenuCategories(systemId),
      ]);
      setItems(data);
      setCategories(
        cats.map((c) => ({
          id: c.id as number,
          label: String(c.name ?? c.id),
        })),
      );
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

  // A menu item's category is required, so the uncategorized section is only
  // ever reached by a row written before that rule (or one whose category has
  // since gone) - it exists so such a dish is still editable, not as a bucket.
  const grouping = useMemo(
    () => ({
      key: "category",
      groups: categories,
      uncategorizedLabel: t("uncategorized"),
    }),
    [categories, t],
  );

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
        grouping={grouping}
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
