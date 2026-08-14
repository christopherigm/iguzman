"use client";

import { useState, useEffect, useCallback } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Typography } from "@repo/ui/core-elements/typography";
import { AdminEntityList } from "@/components/admin/admin-entity-list";
import { useToggleEnabled } from "@/hooks/use-toggle-enabled";
import { listCoupons, deleteCoupon, updateCoupon } from "@/lib/admin-api";
import { couponValueLabel } from "@/lib/coupon-shared";

export default function AdminCouponsPage() {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // No `systemId` argument, unlike the catalog lists: the API scopes coupons
      // to the admin's own tenant from the token, like the contact inbox and the
      // order list.
      const data = await listCoupons();
      // `AdminEntityList` takes untyped rows, so the typed payload is widened
      // here - the same cast the social-posts list makes for the same reason.
      setItems(data as unknown as Record<string, unknown>[]);
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

  const handleToggleEnabled = useToggleEnabled(updateCoupon, setItems, setError);
  const handleDelete = async (id: number) => {
    try {
      await deleteCoupon(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  // Deliberately no `onReorder`, unlike the content lists: coupons have no
  // `sort_order` and nothing renders them in a row a customer sees. A campaign
  // is found by its code, not by where a tenant dragged it.
  const columns = [
    { key: "code", label: t("couponCode") },
    { key: "name", label: t("name") },
    {
      key: "value",
      label: t("couponValue"),
      render: (_value: unknown, row: Record<string, unknown>) =>
        couponValueLabel(
          String(row.kind ?? "percent"),
          String(row.value ?? "0"),
          String(row.currency ?? ""),
        ),
    },
    {
      key: "times_redeemed",
      label: t("couponRedemptions"),
      render: (_value: unknown, row: Record<string, unknown>) => {
        const used = Number(row.times_redeemed ?? 0);
        const max = Number(row.max_redemptions ?? 0);
        // An unlimited coupon still counts up - the number is what a tenant
        // reads as "used 128 times" - so it shows a bare count rather than
        // "128 / 0", which would read as a ceiling that had been blown past.
        return (
          <Typography
            as="span"
            variant="body"
            color={
              max > 0 && used >= max
                ? "var(--error, #c62828)"
                : "var(--foreground)"
            }
          >
            {max > 0 ? `${used} / ${max}` : String(used)}
          </Typography>
        );
      },
    },
    {
      key: "expires_at",
      label: t("couponExpires"),
      render: (value: unknown) => {
        if (!value) return t("couponNoExpiry");
        const when = new Date(String(value));
        const expired = when.getTime() < Date.now();
        return (
          <Typography
            as="span"
            variant="body"
            color={expired ? "var(--error, #c62828)" : "var(--foreground)"}
          >
            {format.dateTime(when, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </Typography>
        );
      },
    },
    { key: "enabled", label: t("enabled") },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("coupons") },
        ]}
      />
      <AdminEntityList
        title={t("coupons")}
        items={items}
        columns={columns}
        basePath="/admin/coupons"
        onDelete={handleDelete}
        onToggleEnabled={handleToggleEnabled}
        loading={loading}
        error={error}
      />
    </>
  );
}
