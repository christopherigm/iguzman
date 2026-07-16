"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AdminEntityList } from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { listBrands, deleteBrand, updateBrand } from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";

export default function AdminBrandsPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listBrands(systemId));
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

  const handleToggleEnabled = useToggleEnabled(updateBrand, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteBrand(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns = [
    { key: "logo", label: "Logo", compact: true },
    { key: "name", label: t("name") },
    { key: "slug", label: "Slug" },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("brands") },
        ]}
      />
      <AdminEntityList
        title={t("brands")}
        items={items}
        columns={columns}
        basePath="/admin/brands"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        loading={loading}
        error={error}
      />
    </>
  );
}
