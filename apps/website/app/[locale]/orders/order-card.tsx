"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Badge } from "@repo/ui/core-elements/badge";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  orderRef,
  type OrderStatus,
  type OrderSummary,
} from "@/lib/orders-shared";
import { formatPrice } from "@/lib/price";

const STATUS_COLORS: Record<OrderStatus, string> = {
  paid: "#22c55e",
  placed: "#f59e0b",
  pending: "#f59e0b",
  failed: "#ef4444",
  canceled: "#ef4444",
  refunded: "#6b7280",
};

/**
 * A paid or refunded order is financial history and cannot be deleted (Django
 * enforces this with a 403); the trash affordance is simply not rendered on
 * those cards. Kept in sync with `DELETABLE_STATUSES` in `orders/views.py`.
 */
const DELETABLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "pending",
  "failed",
  "canceled",
]);

/** How many item thumbnails a history card previews before a "+N" cell. */
const MAX_PREVIEW_IMAGES = 5;

interface OrderCardProps {
  order: OrderSummary;
  locale: string;
}

/**
 * One order-history card. A client component because the delete affordance owns
 * a confirmation modal and a pending state.
 *
 * The whole card navigates to the order, but a card cannot be a single `<a>`
 * when it also holds a delete button - a button nested in an anchor is invalid
 * and the click targets fight. Instead a transparent link fills the card
 * (`zIndex: 1`) and the trash button floats one layer above it (`zIndex: 2`),
 * so the button is the top hit target while every other pixel navigates.
 */
export function OrderCard({ order, locale }: OrderCardProps) {
  const t = useTranslations("Orders");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ref = orderRef(order.public_id);
  const deletable = DELETABLE_STATUSES.has(order.status);

  const shown = order.line_images.slice(0, MAX_PREVIEW_IMAGES);
  const extra = order.line_images.length - shown.length;

  const handleDelete = () => {
    setConfirmOpen(false);
    // The card vanishes on confirm; if the request then fails it comes back
    // rather than silently disappearing from a history that still holds it.
    setRemoved(true);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/auth/orders/${order.public_id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          setRemoved(false);
          return;
        }
        router.refresh();
      } catch {
        setRemoved(false);
      }
    });
  };

  // Optimistically gone; `router.refresh()` then drops the grid cell for good.
  if (removed) return null;

  return (
    <Card padding={10} gap={8} height="100%" styles={{ position: "relative" }}>
      {/* Full-card navigation target, beneath the trash button. */}
      <Box
        href={`/orders/${order.public_id}`}
        prefetch
        aria-label={t("breadcrumb", { id: ref })}
        styles={{ position: "absolute", inset: 0, zIndex: 1 }}
      />

      <Box alignItems="flex-start" justifyContent="space-between" gap={10}>
        <Typography as="h2" variant="h4" margin={0} color="var(--on-surface)">
          {t("breadcrumb", { id: ref })}
        </Typography>
        {deletable && (
          <IconButton
            icon="/icons/delete-trash-icon.svg"
            aria-label={t("deleteOrder")}
            title={t("deleteOrder")}
            kind="error"
            size="sm"
            disabled={isPending}
            flex="0 0 auto"
            onClick={() => setConfirmOpen(true)}
            styles={{ position: "relative", zIndex: 2 }}
          />
        )}
      </Box>

      <Box alignItems="center" gap={10} flexWrap="wrap">
        <Typography
          as="span"
          variant="h5"
          fontWeight={700}
          margin={0}
          color="var(--on-surface)"
        >
          {formatPrice(order.total, order.currency)}
        </Typography>
        <Badge
          variant="filled"
          size="sm"
          color={STATUS_COLORS[order.status]}
          textColor="#fff"
        >
          {t(`status_${order.status}`)}
        </Badge>
        {/* Fulfillment is a separate axis from payment - a "Completed" badge so
            the customer can tell at a glance which orders have been handed over,
            without opening each one. */}
        {order.fulfilled && (
          <Badge variant="subtle" size="sm" color="#22c55e">
            {t("completed")}
          </Badge>
        )}
      </Box>

      <Typography variant="caption" margin={0} color="var(--foreground)">
        {t("placedOn", {
          date: new Date(order.created_at).toLocaleDateString(locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        })}
        {" · "}
        {t("itemCount", { count: order.item_count })}
      </Typography>

      {shown.length > 0 && (
        <>
          {/* Divider. A 1px filled Box rather than a border, so the rule is a
              prop; `marginTop:auto` pins the preview strip to the card's foot so
              cards align across the grid. */}
          <Box
            height={1}
            flex="0 0 auto"
            marginTop="auto"
            backgroundColor="var(--border)"
          />
          <Box gap={6} flexWrap="wrap">
            {shown.map((src, i) => (
              <Box
                key={i}
                width={48}
                height={48}
                flex="0 0 auto"
                borderRadius={8}
                backgroundColor="var(--surface-3, #e5e7eb)"
                styles={{ position: "relative", overflow: "hidden" }}
              >
                <Image
                  fill
                  src={src}
                  alt=""
                  sizes="48px"
                  style={{ objectFit: "cover" }}
                />
              </Box>
            ))}
            {extra > 0 && (
              <Box
                width={48}
                height={48}
                flex="0 0 auto"
                borderRadius={8}
                alignItems="center"
                justifyContent="center"
                backgroundColor="var(--surface-3, #e5e7eb)"
              >
                <Typography
                  as="span"
                  variant="caption"
                  margin={0}
                  fontWeight={700}
                  color="var(--on-surface)"
                >
                  +{extra}
                </Typography>
              </Box>
            )}
          </Box>
        </>
      )}

      {confirmOpen && (
        <ConfirmationModal
          title={t("deleteTitle")}
          text={t("deleteText", { id: ref })}
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
          okCallback={handleDelete}
          cancelCallback={() => setConfirmOpen(false)}
        />
      )}
    </Card>
  );
}

export default OrderCard;
