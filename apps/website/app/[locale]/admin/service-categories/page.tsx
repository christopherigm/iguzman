"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AdminEntityList } from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import {
  listServiceCategories,
  deleteServiceCategory,
  updateServiceCategory,
} from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";

export default function AdminServiceCategoriesPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listServiceCategories(systemId));
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
    updateServiceCategory,
    setItems,
    setError,
  );
  const handleDelete = async (id: number) => {
    try {
      await deleteServiceCategory(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns = [
    { key: "image", label: "Image", compact: true },
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
          { label: t("serviceCategories") },
        ]}
      />
      <AdminEntityList
        title={t("serviceCategories")}
        items={items}
        columns={columns}
        basePath="/admin/service-categories"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        loading={loading}
        error={error}
      />
    </>
  );
}
