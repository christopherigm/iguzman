"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AdminEntityList,
  CellText,
  EmptyCell,
  type Column,
} from "@/components/admin/admin-entity-list";
import { listAdminOrders, type AdminOrderSummary } from "@/lib/admin-api";
import { formatPrice } from "@/lib/price";
import { orderRef, type OrderStatus } from "@/lib/orders-shared";
import { Badge } from "@repo/ui/core-elements/badge";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

/** The accent each status is drawn in - matches the customer-facing banner. */
const STATUS_COLOR: Record<OrderStatus, string> = {
  paid: "#22c55e",
  placed: "#f59e0b",
  pending: "#f59e0b",
  failed: "#ef4444",
  canceled: "#ef4444",
  refunded: "#6b7280",
};

export default function AdminOrdersPage() {
  const t = useTranslations("AdminOrders");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orders = await listAdminOrders();
      // `id` is what AdminEntityList keys rows by and builds the row link from
      // (`/admin/orders/<id>`); orders are addressed by their public UUID, so
      // that is the id here - never a sequential number.
      setItems(
        orders.map((o: AdminOrderSummary) => ({ ...o, id: o.public_id })),
      );
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const columns: Column[] = [
    {
      key: "public_id",
      label: t("colRef"),
      render: (v) => <CellText>{orderRef(String(v))}</CellText>,
    },
    {
      key: "status",
      label: t("colStatus"),
      render: (v) => {
        const status = String(v) as OrderStatus;
        return (
          <Badge variant="subtle" size="sm" color={STATUS_COLOR[status]}>
            {t(`status_${status}`)}
          </Badge>
        );
      },
    },
    {
      key: "payment_method",
      label: t("colMethod"),
      render: (v) => <CellText>{t(`method_${String(v)}`)}</CellText>,
    },
    {
      key: "fulfilled",
      label: t("colFulfilled"),
      render: (v) =>
        v ? (
          <Badge variant="subtle" size="sm" color="#22c55e">
            {t("fulfilledYes")}
          </Badge>
        ) : (
          <CellText>{t("fulfilledNo")}</CellText>
        ),
    },
    {
      key: "shipping_name",
      label: t("colCustomer"),
      render: (v, row) => {
        const who = String(v || row.email || "");
        return who ? <CellText title={who}>{who}</CellText> : <EmptyCell />;
      },
    },
    {
      key: "total",
      label: t("colTotal"),
      render: (v, row) => (
        <CellText>{formatPrice(String(v), String(row.currency))}</CellText>
      ),
    },
    {
      key: "created_at",
      label: t("colDate"),
      render: (v) => (
        <CellText>{new Date(String(v)).toLocaleDateString()}</CellText>
      ),
    },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("title") },
        ]}
      />
      <AdminEntityList
        title={t("title")}
        items={items}
        columns={columns}
        basePath="/admin/orders"
        loading={loading}
        error={error}
        hideCreate
      />
    </>
  );
}
