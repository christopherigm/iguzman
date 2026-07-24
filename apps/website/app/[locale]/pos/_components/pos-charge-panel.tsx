"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { formatPrice } from "@/lib/price";
import { orderRef } from "@/lib/orders-shared";
import {
  AdminApiError,
  adminOrderAction,
  posCheckout,
  type PosPaymentMethod,
} from "@/lib/admin-api";
import { toCartPayload, type PosLine } from "@/lib/pos";

interface Props {
  lines: PosLine[];
  total: number;
  currency: string;
  onCompleted: () => void;
  onBack: () => void;
  onError: (message: string) => void;
}

/**
 * Taking the money.
 *
 * Two steps, and the split is the whole point. **Placing** the order happens
 * first, before the customer has paid anything: the sale is recorded, stock is
 * drawn down, and it gets an order reference. **Completing** it is a separate
 * confirmation the associate makes once the money has actually arrived. A sale
 * abandoned at the card machine therefore leaves a `placed` order in the
 * tenant's list rather than vanishing, which is the state a shop can actually
 * reconcile against a terminal's end-of-day batch.
 *
 * Today the associate confirms payment by hand for both methods. When a terminal
 * provider is wired in, the confirmation for `terminal` becomes "the provider
 * told us this amount arrived" - the manual button stays regardless, because a
 * reader that fails to report must never be able to strand a paid sale.
 */
export function PosChargePanel({
  lines,
  total,
  currency,
  onCompleted,
  onBack,
  onError,
}: Props) {
  const t = useTranslations("Pos");

  const [method, setMethod] = useState<PosPaymentMethod>("terminal");
  const [email, setEmail] = useState("");
  /** Set once the order exists; from here the sale is recorded and the only
   *  remaining question is whether the money arrived. */
  const [placed, setPlaced] = useState<{ publicId: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const failureMessage = (err: unknown): string => {
    if (err instanceof AdminApiError) {
      const code = (err.data as { code?: string }).code;
      if (code === "OUT_OF_STOCK") return t("errorOutOfStock");
      if (code === "CART_EMPTY") return t("errorCartEmpty");
      if (code === "MIXED_CURRENCY") return t("mixedCurrency");
    }
    return t("errorGeneric");
  };

  const handlePlace = () => {
    startTransition(async () => {
      try {
        const order = await posCheckout({
          cart: toCartPayload(lines),
          payment_method: method,
          // Only sent when the associate actually took one; the API treats every
          // contact field as optional.
          ...(email.trim() ? { contact: { email: email.trim() } } : {}),
        });
        setPlaced({ publicId: order.public_id });
      } catch (err) {
        onError(failureMessage(err));
      }
    });
  };

  const handleComplete = () => {
    if (!placed) return;
    startTransition(async () => {
      try {
        await adminOrderAction(placed.publicId, "complete");
        onCompleted();
      } catch {
        // The order exists and is correct; only the settle failed. Say so
        // rather than clearing the basket, so the associate can retry instead
        // of re-ringing a sale that is already in the system.
        onError(t("errorCompleteFailed"));
      }
    });
  };

  return (
    <Box flexDirection="column" height="100%" styles={{ minHeight: 0 }}>
      <Box
        alignItems="center"
        justifyContent="space-between"
        gap={8}
        padding={12}
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
      >
        <Typography as="h2" variant="h4" margin={0} fontWeight={700}>
          {placed ? t("awaitingPayment") : t("charge")}
        </Typography>
        {/* Only before the order exists. Once it is placed there is nothing to
            go "back" to - the sale is recorded and must be settled or canceled
            from the orders list, not abandoned by navigating away. */}
        {!placed && (
          <Button text={t("back")} size="md" onClick={onBack} disabled={isPending} />
        )}
      </Box>

      <Box
        flex="1 1 auto"
        flexDirection="column"
        gap={16}
        padding={12}
        styles={{ minHeight: 0, overflowY: "auto" }}
      >
        <Box flexDirection="column" gap={4} alignItems="center" paddingY={8}>
          <Typography variant="caption" margin={0}>
            {t("amountDue")}
          </Typography>
          <Typography variant="h1" margin={0} fontWeight={700}>
            {formatPrice(total.toFixed(2), currency)}
          </Typography>
        </Box>

        {placed ? (
          <Box flexDirection="column" gap={10}>
            <Typography variant="body" margin={0} textAlign="center">
              {t("orderPlaced", { ref: orderRef(placed.publicId) })}
            </Typography>
            <Typography variant="body" margin={0} textAlign="center">
              {method === "terminal"
                ? t("handTerminal")
                : t("collectCash")}
            </Typography>
          </Box>
        ) : (
          <Box flexDirection="column" gap={12}>
            <Typography variant="body" margin={0} fontWeight={600}>
              {t("paymentMethod")}
            </Typography>
            <Box gap={10} flexWrap="wrap">
              <Button
                text={t("methodTerminal")}
                size="xl"
                flex="1"
                minWidth={130}
                kind={method === "terminal" ? "primary" : undefined}
                aria-pressed={method === "terminal"}
                onClick={() => setMethod("terminal")}
              />
              <Button
                text={t("methodCash")}
                size="xl"
                flex="1"
                minWidth={130}
                kind={method === "cash" ? "primary" : undefined}
                aria-pressed={method === "cash"}
                onClick={() => setMethod("cash")}
              />
            </Box>

            <TextInput
              label={t("receiptEmail")}
              helperText={t("receiptEmailHint")}
              value={email}
              onChange={setEmail}
              type="email"
            />
          </Box>
        )}
      </Box>

      <Box
        flexDirection="column"
        gap={10}
        padding={12}
        styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
      >
        {isPending && (
          <Box justifyContent="center">
            <Spinner label={t("working")} />
          </Box>
        )}
        {placed ? (
          <Button
            text={t("confirmPaid")}
            kind="success"
            size="xl"
            width="100%"
            disabled={isPending}
            onClick={handleComplete}
          />
        ) : (
          <Button
            text={t("placeOrder")}
            kind="primary"
            size="xl"
            width="100%"
            disabled={isPending || lines.length === 0}
            onClick={handlePlace}
          />
        )}
      </Box>
    </Box>
  );
}
