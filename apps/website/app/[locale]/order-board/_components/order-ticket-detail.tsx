"use client";

import { useTranslations } from "next-intl";
import { Link } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Badge } from "@repo/ui/core-elements/badge";
import { Typography } from "@repo/ui/core-elements/typography";
import { formatPrice } from "@/lib/price";
import { orderRef } from "@/lib/orders-shared";
import { FULFILLED_COLOR } from "@/lib/order-board";
import type { AdminOrder, AdminOrderAction } from "@/lib/admin-api";
import { WaitingChip } from "./waiting-chip";

interface Props {
  order: AdminOrder | null;
  loading: boolean;
  busy: boolean;
  now: number;
  onAction: (action: AdminOrderAction) => void;
  /** Below sm only: dismiss the sheet and go back to the list. */
  onClose: () => void;
}

/**
 * One ticket in full - what to make, and the button that says it is done.
 *
 * ⚠ **There is deliberately no "Mark paid" here.** Taking money is the
 * cashier's job, on `/pos` or in the CMS; this screen exists to *process*
 * orders, and a payment button on a tablet in a kitchen is a state change made
 * by whoever is not holding the cash. An order's "Unpaid" chip is still shown -
 * so a cook packing it knows the counter has to collect - it just isn't
 * actionable from here.
 *
 * Marking a ticket fulfilled empties this pane: what it showed has been made.
 * The ticket itself does not leave the board - it drops to the fulfilled group
 * at the bottom of the rail, and re-opening it is where the undo lives.
 */
export function OrderTicketDetail({
  order,
  loading,
  busy,
  now,
  onAction,
  onClose,
}: Props) {
  const t = useTranslations("OrderBoard");
  // Statuses and payment methods keep the CMS's labels - see the note in
  // `order-ticket-list.tsx`.
  const tOrders = useTranslations("AdminOrders");

  if (order === null) {
    return (
      <Box
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        height="100%"
        padding={24}
      >
        <Typography variant="body" margin={0} textAlign="center">
          {loading ? t("loading") : t("nothingSelected")}
        </Typography>
      </Box>
    );
  }

  const address = [
    order.shipping_line1,
    order.shipping_line2,
    [order.shipping_city, order.shipping_state].filter(Boolean).join(", "),
    order.shipping_postal_code,
    order.shipping_country,
  ].filter(Boolean);

  return (
    <Box flexDirection="column" height="100%" styles={{ minHeight: 0 }}>
      <Box
        alignItems="center"
        justifyContent="space-between"
        gap={10}
        padding={12}
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
      >
        <Box alignItems="center" gap={10} flexWrap="wrap">
          <Typography as="h2" variant="h4" margin={0} fontWeight={700}>
            {orderRef(order.public_id)}
          </Typography>
          {/* Nobody is waiting on a ticket that has gone out, so the clock
              stops rather than climbing into the red behind the counter. */}
          {order.fulfilled ? (
            <Badge variant="subtle" size="md" color={FULFILLED_COLOR}>
              {tOrders("fulfilledYes")}
            </Badge>
          ) : (
            <WaitingChip createdAt={order.created_at} now={now} size="md" />
          )}
          {order.status === "placed" && (
            <Badge variant="subtle" size="md" color="#f59e0b">
              {t("unpaid")}
            </Badge>
          )}
        </Box>

        {/* xs only - from sm up the ticket is a permanent column. */}
        <Box className="order-board-detail__back">
          <Button
            text={t("back")}
            size="md"
            kind="primary"
            aria-label={t("back")}
            onClick={onClose}
          />
        </Box>
      </Box>

      <Box
        flex="1 1 auto"
        flexDirection="column"
        gap={14}
        padding={14}
        styles={{ minHeight: 0, overflowY: "auto" }}
      >
        {/* What to make. Deliberately the first and largest thing on the pane -
            everything else here is context for it. */}
        <Box flexDirection="column" gap={10}>
          {order.lines.map((line) => (
            <Box
              key={line.id}
              flexDirection="column"
              gap={4}
              paddingBottom={10}
              styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
            >
              <Box alignItems="baseline" gap={10}>
                <Typography
                  as="span"
                  variant="h4"
                  margin={0}
                  fontWeight={700}
                  minWidth={44}
                >
                  {line.quantity}×
                </Typography>
                <Typography as="span" variant="h5" margin={0}>
                  {line.name}
                </Typography>
                {/* The size sits beside the name at the same weight, not down in
                    the add-on list: it is *which dish to make*, not a change made
                    to one, and a cook reading "Margarita" off a ticket for a
                    12-inch has already started the wrong pizza. From the line's
                    own snapshot, so it survives the size being renamed. */}
                {line.size_name && (
                  <Typography
                    as="span"
                    variant="h5"
                    margin={0}
                    fontWeight={700}
                    color="var(--accent)"
                  >
                    {line.size_name}
                  </Typography>
                )}
              </Box>
              {line.customization.length > 0 && (
                <Box flexDirection="column" gap={2} paddingLeft={54}>
                  {line.customization.map((row, idx) => (
                    <Typography
                      key={idx}
                      variant="body"
                      margin={0}
                      fontWeight={600}
                      // Removals read as a warning, additions as ordinary
                      // detail: leaving an ingredient out is the instruction a
                      // kitchen gets wrong.
                      color={
                        row.removed
                          ? "var(--error, #ef4444)"
                          : "var(--foreground)"
                      }
                    >
                      {row.removed
                        ? `− ${row.name}`
                        : `${row.quantity}× ${row.name}`}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>

        <Box flexDirection="column" gap={6}>
          <DetailRow
            label={tOrders("method")}
            value={tOrders(`method_${order.payment_method}`)}
          />
          <DetailRow
            label={tOrders("colStatus")}
            value={tOrders(`status_${order.status}`)}
          />
          <DetailRow
            label={t("placedAt")}
            value={new Date(order.created_at).toLocaleTimeString()}
          />
          <DetailRow
            label={tOrders("total")}
            value={formatPrice(order.total, order.currency)}
          />
          {order.shipping_name ? (
            <DetailRow
              label={tOrders("customer")}
              value={order.shipping_name}
            />
          ) : null}
          {order.phone ? (
            <DetailRow label={tOrders("contactPhone")} value={order.phone} />
          ) : null}
        </Box>

        {address.length > 0 && (
          <Box flexDirection="column" gap={2}>
            <Typography variant="label" margin={0}>
              {tOrders("deliveryAddress")}
            </Typography>
            {address.map((line) => (
              <Typography key={line} variant="body" margin={0}>
                {line}
              </Typography>
            ))}
          </Box>
        )}

        {/* The way out of the board and into the full record - refunds,
            cancellation and everything else this screen deliberately cannot do. */}
        <Link href={`/admin/orders/${order.public_id}`} prefetch>
          <Typography variant="caption" margin={0} color="var(--accent)">
            {t("openInAdmin")}
          </Typography>
        </Link>
      </Box>

      <Box
        flexDirection="column"
        gap={10}
        padding={12}
        styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
      >
        {order.fulfilled ? (
          // The undo, reached by opening a ticket from the fulfilled group at
          // the bottom of the rail.
          <Button
            text={tOrders("unmarkFulfilled")}
            kind="warning"
            size="lg"
            width="100%"
            disabled={busy}
            onClick={() => onAction("unmark_fulfilled")}
          />
        ) : (
          <Button
            text={tOrders("markFulfilled")}
            kind="success"
            size="xl"
            width="100%"
            disabled={busy}
            onClick={() => onAction("mark_fulfilled")}
          />
        )}
      </Box>
    </Box>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box alignItems="baseline" justifyContent="space-between" gap={12}>
      <Typography as="span" variant="label" margin={0}>
        {label}
      </Typography>
      <Typography as="span" variant="body" margin={0}>
        {value}
      </Typography>
    </Box>
  );
}
