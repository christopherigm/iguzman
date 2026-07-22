"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Badge } from "@repo/ui/core-elements/badge";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  adminOrderAction,
  getAdminOrder,
  type AdminOrder,
  type AdminOrderAction,
} from "@/lib/admin-api";
import { formatPrice } from "@/lib/price";
import { orderRef, type OrderStatus } from "@/lib/orders-shared";

const STATUS_COLOR: Record<OrderStatus, string> = {
  paid: "#22c55e",
  placed: "#f59e0b",
  pending: "#f59e0b",
  failed: "#ef4444",
  canceled: "#ef4444",
  refunded: "#6b7280",
};

/**
 * The tenant's view of one order, and the two independent things they do to it:
 * take payment (`status`) and hand it over (`fulfilled`). Marking paid is only
 * offered on an offline order that is still outstanding - an online order's money
 * is Stripe's to confirm, and the API refuses a manual flip.
 */
export default function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("AdminOrders");
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrder(await getAdminOrder(id));
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const runAction = useCallback(
    async (action: AdminOrderAction) => {
      setBusy(true);
      setError(null);
      try {
        setOrder(await adminOrderAction(id, action));
      } catch {
        setError(t("errorAction"));
      } finally {
        setBusy(false);
      }
    },
    [id, t],
  );

  if (loading) {
    return <Typography variant="body">{t("loading")}</Typography>;
  }
  if (error && !order) {
    return <Typography variant="body">{error}</Typography>;
  }
  if (!order) return null;

  const isOutstanding =
    order.status === "placed" || order.status === "pending";
  const canMarkPaid = order.payment_method !== "online" && isOutstanding;

  const address = [
    order.shipping_name,
    order.shipping_line1,
    order.shipping_line2,
    [order.shipping_city, order.shipping_state].filter(Boolean).join(", "),
    order.shipping_postal_code,
    order.shipping_country,
  ].filter(Boolean);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("title"), href: "/admin/orders" },
          { label: orderRef(order.public_id) },
        ]}
      />

      <Box flexDirection="column" gap={20}>
        <Box
          alignItems="center"
          justifyContent="space-between"
          gap={16}
          flexWrap="wrap"
        >
          <Typography as="h1" variant="h3" margin={0}>
            {t("detailTitle", { id: orderRef(order.public_id) })}
          </Typography>
          <Box gap={8} alignItems="center" flexWrap="wrap">
            <Badge
              variant="subtle"
              size="sm"
              color={STATUS_COLOR[order.status]}
            >
              {t(`status_${order.status}`)}
            </Badge>
            {order.fulfilled ? (
              <Badge variant="subtle" size="sm" color="#22c55e">
                {t("fulfilledYes")}
              </Badge>
            ) : null}
          </Box>
        </Box>

        {error ? (
          <Typography variant="caption" color="var(--error, #ef4444)">
            {error}
          </Typography>
        ) : null}

        {/* Actions: payment and fulfillment are independent axes. */}
        <Box gap={8} flexWrap="wrap">
          {canMarkPaid ? (
            <Button
              text={t("markPaid")}
              kind="primary"
              size="sm"
              disabled={busy}
              onClick={() => runAction("mark_paid")}
            />
          ) : null}
          {order.fulfilled ? (
            <Button
              text={t("unmarkFulfilled")}
              kind="warning"
              size="sm"
              disabled={busy}
              onClick={() => runAction("unmark_fulfilled")}
            />
          ) : (
            <Button
              text={t("markFulfilled")}
              kind="primary"
              size="sm"
              disabled={busy}
              onClick={() => runAction("mark_fulfilled")}
            />
          )}
          {isOutstanding ? (
            <Button
              text={t("cancelOrder")}
              kind="error"
              size="sm"
              disabled={busy}
              onClick={() => runAction("cancel")}
            />
          ) : null}
        </Box>

        <Box display="grid" gap={16} styles={{ gridTemplateColumns: "1fr" }}>
          <Card gap={12}>
            <Typography as="h2" variant="h5" margin={0}>
              {t("customer")}
            </Typography>
            <Box height={1} backgroundColor="var(--border)" />
            <DetailRow label={t("method")} value={t(`method_${order.payment_method}`)} />
            {order.email ? (
              <DetailRow label={t("contactEmail")} value={order.email} />
            ) : null}
            {order.phone ? (
              <DetailRow label={t("contactPhone")} value={order.phone} />
            ) : null}
            {address.length > 0 ? (
              <Box flexDirection="column" gap={2}>
                <Typography variant="label" margin={0} color="var(--foreground)">
                  {t("deliveryAddress")}
                </Typography>
                {address.map((line) => (
                  <Typography
                    key={line}
                    variant="caption"
                    margin={0}
                    color="var(--on-surface)"
                  >
                    {line}
                  </Typography>
                ))}
              </Box>
            ) : null}
          </Card>

          <Card gap={12}>
            <Typography as="h2" variant="h5" margin={0}>
              {t("items")}
            </Typography>
            <Box height={1} backgroundColor="var(--border)" />
            {order.lines.map((line) => (
              <Box
                key={line.id}
                alignItems="baseline"
                justifyContent="space-between"
                gap={8}
              >
                <Typography as="span" variant="body" color="var(--on-surface)">
                  {line.quantity} × {line.name}
                </Typography>
                <Typography as="span" variant="body" color="var(--on-surface)">
                  {formatPrice(line.line_total, line.currency)}
                </Typography>
              </Box>
            ))}
            <Box height={1} backgroundColor="var(--border)" />
            <Box alignItems="baseline" justifyContent="space-between" gap={8}>
              <Typography as="span" variant="h6" margin={0}>
                {t("total")}
              </Typography>
              <Typography as="span" variant="h6" margin={0} fontWeight={700}>
                {formatPrice(order.total, order.currency)}
              </Typography>
            </Box>
          </Card>
        </Box>
      </Box>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box alignItems="baseline" justifyContent="space-between" gap={12}>
      <Typography as="span" variant="label" margin={0} color="var(--foreground)">
        {label}
      </Typography>
      <Typography as="span" variant="body" margin={0} color="var(--on-surface)">
        {value}
      </Typography>
    </Box>
  );
}
