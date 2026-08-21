"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AdminEntityList } from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import {
  listMenuCategories,
  deleteMenuCategory,
  updateMenuCategory,
} from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

export default function AdminMenuCategoriesPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listMenuCategories(systemId));
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [systemId, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleToggleEnabled = useToggleEnabled(
    updateMenuCategory,
    setItems,
    setError,
  );
  const handleReorder = useReorder(updateMenuCategory, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteMenuCategory(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns = [
    { key: "image", label: t("image") ?? "Image", compact: true },
    { key: "name", label: t("name") },
    { key: "slug", label: "Slug" },
    { key: "item_count", label: t("items") ?? "Items" },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("menuCategories") },
        ]}
      />
      <AdminEntityList
        title={t("menuCategories")}
        items={items}
        columns={columns}
        basePath="/admin/menu-categories"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        bulkActions={{
          translate: ["name", "description"],
          image: true,
          update: updateMenuCategory,
          reload: load,
        }}
        loading={loading}
        error={error}
      />
    </>
  );
}
