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
  listServices,
  listServiceCategories,
  deleteService,
  updateService,
} from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

export default function AdminServicesPage() {
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
      // themselves, which is the order the API already returns them in
      // (`sort_order`, then name). Grouping by the rows alone could only order
      // the sections by whichever item happens to come first.
      const [data, cats] = await Promise.all([
        listServices(systemId),
        listServiceCategories(systemId),
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
  }, [systemId, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleToggleEnabled = useToggleEnabled(
    updateService,
    setItems,
    setError,
  );
  const handleReorder = useReorder(updateService, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteService(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const grouping = useMemo(
    () => ({
      key: "category",
      groups: categories,
      uncategorizedLabel: t("uncategorized"),
    }),
    [categories, t],
  );

  const columns = [
    { key: "image", label: "Image", compact: true },
    { key: "name", label: t("name") },
    { key: "sku", label: "SKU" },
    {
      key: "price",
      label: t("price") ?? "Price",
      render: (v: unknown, r: Record<string, unknown>) =>
        v != null ? (
          <CellText>{`${v} ${r.currency ?? ""}`}</CellText>
        ) : (
          <EmptyCell />
        ),
    },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("services") },
        ]}
      />
      <AdminEntityList
        title={t("services")}
        items={items}
        columns={columns}
        grouping={grouping}
        basePath="/admin/services"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        bulkActions={{
          translate: ["name", "short_description", "description"],
          image: true,
          rewards: true,
          // Scoped to this list: rebuilds only these records' slugs from
          // the tenant's site prefix. /admin/system carries the same
          // component with no `models`, for the whole site at once.
          recreate: ["service"],
          update: updateService,
          reload: load,
        }}
        loading={loading}
        error={error}
      />
    </>
  );
}
