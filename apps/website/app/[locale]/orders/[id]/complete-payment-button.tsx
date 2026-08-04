"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";

interface CompletePaymentButtonProps {
  /** The order's `public_id` - the only handle a guest's order has. */
  publicId: string;
}

/** Codes `OrderPayView` refuses with, mapped to what we tell the customer. */
const ERROR_MESSAGES: Record<string, string> = {
  ALREADY_PAID: "payAlreadyPaid",
  OUT_OF_STOCK: "payOutOfStock",
  SLOT_UNAVAILABLE: "paySlotUnavailable",
  ORDER_CLOSED: "payOrderClosed",
  NOT_ONLINE_ORDER: "payOrderClosed",
  PAYMENTS_UNAVAILABLE: "payUnavailable",
};

/**
 * Send the customer back to Stripe for an order they left unpaid.
 *
 * The order and its frozen lines already exist, so this asks the API to reopen
 * checkout on *that* order rather than making the customer rebuild a cart -
 * which for an appointment would be worse than an inconvenience, since the
 * booking is holding its own slot and the hour they wanted is the one hour they
 * could not rebook.
 *
 * Rendered only for a `pending` online order (see `page.tsx`). Every reason it
 * can be refused is a real state change on the server's side - the item sold
 * out, the slot went, the webhook landed while the page sat open - so a failure
 * refreshes the page rather than only printing a message: the banner and the
 * button itself both need to be re-decided from the order's new state.
 */
export function CompletePaymentButton({ publicId }: CompletePaymentButtonProps) {
  const t = useTranslations("Orders");
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${publicId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The locale the Stripe return URLs should come back to. Nothing else:
        // the API charges the order's own lines, so a body that could name an
        // amount is a body that could name its own.
        body: JSON.stringify({ locale }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setError(t(ERROR_MESSAGES[data.code ?? ""] ?? "payError"));
        setLoading(false);
        // Whatever refused us changed the order (or proved it had already
        // moved), so re-read it - the status banner above is now stale too.
        router.refresh();
        return;
      }

      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setError(t("payError"));
        setLoading(false);
        return;
      }
      // An absolute Stripe URL, so nothing prefixes a locale for us.
      window.location.href = data.url;
      // `loading` stays true: the page is navigating away, and resetting it
      // would flash an enabled button during the redirect.
    } catch {
      setError(t("payError"));
      setLoading(false);
    }
  }, [publicId, locale, t, router]);

  return (
    <Box flexDirection="column" gap={6}>
      <Button
        text={loading ? t("payLoading") : t("completePayment")}
        onClick={handleClick}
        isLoading={loading}
        kind="primary"
        width="100%"
      />
      {error !== null && (
        <Typography variant="caption" margin={0} color="var(--error, #ef4444)">
          {error}
        </Typography>
      )}
    </Box>
  );
}
