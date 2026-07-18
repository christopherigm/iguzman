"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import type { OrderStatus } from "@/lib/orders";

interface OrderStatusBannerProps {
  status: OrderStatus;
  /** True when Stripe redirected here, i.e. the customer just paid. */
  justPaid: boolean;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 10;

const STATUS_COLORS: Record<OrderStatus, string> = {
  paid: "var(--success, #22c55e)",
  pending: "var(--warning, #f59e0b)",
  failed: "var(--error, #ef4444)",
  canceled: "var(--error, #ef4444)",
  refunded: "var(--foreground)",
};

/**
 * What happened to this order, and - right after payment - a short wait for the
 * webhook to say so.
 *
 * Coming back from Stripe proves nothing on its own: the success URL is a plain
 * redirect, so only the signed webhook may mark an order paid, and it may not
 * have arrived yet when this page renders. So when we arrive with a `session_id`
 * on an order still `pending`, we refresh for a few seconds rather than telling
 * the customer their payment did not go through. If the webhook is genuinely
 * delayed we stop and say "confirming" - never "failed", which would be a lie
 * about money that has almost certainly already moved.
 */
export function OrderStatusBanner({
  status,
  justPaid,
}: OrderStatusBannerProps) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  const waitingForWebhook = justPaid && status === "pending";
  const gaveUpWaiting = waitingForWebhook && attempts >= MAX_POLLS;

  useEffect(() => {
    if (!waitingForWebhook || attempts >= MAX_POLLS) return;

    const timer = setTimeout(() => {
      setAttempts((n) => n + 1);
      // Re-runs the server component, which re-reads the order uncached. The
      // status prop changes on its own once the webhook lands, which ends this.
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [waitingForWebhook, attempts, router]);

  const message = waitingForWebhook
    ? gaveUpWaiting
      ? t("statusConfirmingSlow")
      : t("statusConfirming")
    : t(`status_${status}`);

  const color = waitingForWebhook
    ? "var(--warning, #f59e0b)"
    : STATUS_COLORS[status];

  return (
    <Box
      flexDirection="column"
      gap={6}
      padding={10}
      borderRadius={8}
      backgroundColor="color-mix(in srgb, var(--surface-1) 70%, transparent)"
      border={`1px solid ${color}`}
      width="100%"
    >
      <Typography
        as="h2"
        variant="h6"
        margin={0}
        color={color}
        aria-live="polite"
      >
        {message}
      </Typography>
      {status === "paid" ? (
        <Typography variant="caption" margin={0} color="var(--foreground)">
          {t("paidNote")}
        </Typography>
      ) : null}
    </Box>
  );
}
