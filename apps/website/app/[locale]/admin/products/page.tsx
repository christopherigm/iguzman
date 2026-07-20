"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AdminEntityList,
  CellText,
  EmptyCell,
} from "@/components/admin/admin-entity-list";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { listProducts, deleteProduct, updateProduct } from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { useReorder } from "@/hooks/use-reorder";

export default function AdminProductsPage() {
  const t = useTranslations("Admin");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const systemId = useSession()?.systemId ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProducts(systemId);
      setItems(data);
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
    updateProduct,
    setItems,
    setError,
  );
  const handleReorder = useReorder(updateProduct, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteProduct(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  const columns = [
    { key: "image", label: t("image") ?? "Image", compact: true },
    { key: "name", label: t("name") },
    { key: "sku", label: "SKU" },
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
    { key: "in_stock", label: t("inStock") ?? "In Stock" },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("products") },
        ]}
      />
      <AdminEntityList
        title={t("products")}
        items={items}
        columns={columns}
        basePath="/admin/products"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        onReorder={handleReorder}
        loading={loading}
        error={error}
      />
    </>
  );
}
