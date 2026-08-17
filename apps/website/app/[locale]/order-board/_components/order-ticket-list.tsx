"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Badge } from "@repo/ui/core-elements/badge";
import { Typography } from "@repo/ui/core-elements/typography";
import { formatPrice } from "@/lib/price";
import {
  FULFILLED_COLOR,
  WAITING_COLOR,
  minutesWaiting,
  waitingLevel,
} from "@/lib/order-board";
import { orderRef } from "@/lib/orders-shared";
import type { AdminOrderSummary } from "@/lib/admin-api";
import { WaitingChip } from "./waiting-chip";

interface Props {
  /** Still to be made, oldest first. */
  waiting: AdminOrderSummary[];
  /** The latest `BOARD_FULFILLED_LIMIT` that have gone out, newest first. */
  fulfilled: AdminOrderSummary[];
  selectedId: string | null;
  now: number;
  loading: boolean;
  error: string | null;
  onSelect: (publicId: string) => void;
}

/**
 * Everything waiting, oldest at the top - then what has just gone out, under a
 * divider.
 *
 * Deliberately terse - a reference, how long it has waited, how many items and
 * who it is for. What is actually *in* the order is the open ticket's job: the
 * list endpoint carries no lines, and a rail that tried to show them would
 * need a request per row and still be unreadable across a kitchen.
 *
 * ⚠ **The unfulfilled tickets always come first**, whatever their times say
 * against the fulfilled ones. The rail is a queue of work, not a log: an order
 * that still has to be made must never be pushed down the screen by one that is
 * already in the customer's hands.
 */
export function OrderTicketList({
  waiting,
  fulfilled,
  selectedId,
  now,
  loading,
  error,
  onSelect,
}: Props) {
  const t = useTranslations("OrderBoard");

  if (loading) {
    return (
      <Typography variant="body" margin={0} padding={20} textAlign="center">
        {t("loading")}
      </Typography>
    );
  }

  return (
    <Box flexDirection="column" gap={8} padding={10}>
      {error !== null && (
        <Typography variant="caption" margin={0} color="var(--error, #ef4444)">
          {error}
        </Typography>
      )}

      {waiting.length === 0 ? (
        <Box flexDirection="column" gap={6} paddingY={40} paddingX={16}>
          <Typography variant="h5" margin={0} textAlign="center">
            {t("emptyTitle")}
          </Typography>
          <Typography variant="body" margin={0} textAlign="center">
            {t("emptyText")}
          </Typography>
        </Box>
      ) : (
        waiting.map((ticket) => (
          <TicketRow
            key={ticket.public_id}
            ticket={ticket}
            selected={ticket.public_id === selectedId}
            now={now}
            onSelect={() => onSelect(ticket.public_id)}
          />
        ))
      )}

      {fulfilled.length > 0 && (
        <>
          {/* The divider is the whole reason the group reads as history rather
              than as more work: without it a dimmed row is just a row. */}
          <Typography
            as="h2"
            variant="label"
            margin={0}
            marginTop={10}
            paddingTop={10}
            paddingX={2}
            styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
          >
            {t("fulfilledSection")}
          </Typography>
          {fulfilled.map((ticket) => (
            <TicketRow
              key={ticket.public_id}
              ticket={ticket}
              selected={ticket.public_id === selectedId}
              now={now}
              onSelect={() => onSelect(ticket.public_id)}
            />
          ))}
        </>
      )}
    </Box>
  );
}

function TicketRow({
  ticket,
  selected,
  now,
  onSelect,
}: {
  ticket: AdminOrderSummary;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  const t = useTranslations("OrderBoard");
  // The payment method's own labels live in the CMS namespace, which already
  // covers every method an order can carry; a second copy here would be five
  // more strings per locale that could only drift from those.
  const tOrders = useTranslations("AdminOrders");

  const level = waitingLevel(minutesWaiting(ticket.created_at, now));
  const who = ticket.shipping_name || ticket.email || ticket.phone;

  // A fulfilled ticket keeps its shape but stops competing for attention: the
  // urgency stripe would otherwise go on climbing into the red for an order
  // that is already in the customer's hands.
  const stripe = ticket.fulfilled ? FULFILLED_COLOR : WAITING_COLOR[level];

  return (
    <Button
      unstyled
      className={`order-board-ticket${
        ticket.fulfilled ? " order-board-ticket--fulfilled" : ""
      }`}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      gap={6}
      width="100%"
      padding={12}
      borderRadius={8}
      border={`1px solid ${selected ? "var(--accent)" : "var(--border, #e5e7eb)"}`}
      backgroundColor={selected ? "var(--surface-2)" : "transparent"}
      // The urgency stripe: the one thing readable from across a kitchen.
      // `borderLeft` has no UIComponentProps entry, so it takes the documented
      // `styles` escape hatch rather than a CSS class.
      styles={{
        borderLeft: `5px solid ${stripe}`,
        textAlign: "left",
      }}
    >
      <Box alignItems="center" justifyContent="space-between" gap={8}>
        <Typography as="span" variant="h6" margin={0} fontWeight={700}>
          {orderRef(ticket.public_id)}
        </Typography>
        {ticket.fulfilled ? (
          <Badge variant="subtle" size="sm" color={FULFILLED_COLOR}>
            {tOrders("fulfilledYes")}
          </Badge>
        ) : (
          <WaitingChip createdAt={ticket.created_at} now={now} />
        )}
      </Box>

      <Box alignItems="baseline" justifyContent="space-between" gap={8}>
        <Typography as="span" variant="caption" margin={0}>
          {t("itemCount", { count: ticket.item_count })}
        </Typography>
        <Typography as="span" variant="body" margin={0} fontWeight={600}>
          {formatPrice(ticket.total, ticket.currency)}
        </Typography>
      </Box>

      {who ? (
        <Typography as="span" variant="caption" margin={0} title={who}>
          {who}
        </Typography>
      ) : null}

      <Box gap={6} flexWrap="wrap" alignItems="center">
        <Badge variant="subtle" size="sm">
          {tOrders(`method_${ticket.payment_method}`)}
        </Badge>
        {/* An offline order is on the board because the customer committed to
            it, not because the money arrived - so the row says so, and the
            counter knows to collect on handover. */}
        {ticket.status === "placed" && (
          <Badge variant="subtle" size="sm" color="#f59e0b">
            {t("unpaid")}
          </Badge>
        )}
      </Box>
    </Button>
  );
}
