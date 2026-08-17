/**
 * The order board's rules: which orders belong on it, in what order, and how
 * long each one has been waiting.
 *
 * Pure and client-safe, like `lib/pos.ts` and `lib/orders-shared.ts` - the board
 * is one client component and nothing here may reach `next/headers`.
 *
 * ⚠ **The board introduces no order states.** It is a *view* over the two
 * statuses an order can already be in, and its only write is the fulfillment
 * flag `/admin/orders` already toggles (`mark_fulfilled` / `unmark_fulfilled`).
 * If a kitchen ever needs "accepted" or "in progress", that is a model change
 * in website-api - not a third meaning quietly given to `fulfilled` here, which
 * the CMS and the customer's order page both read.
 *
 * ⚠ **And it does not take payment.** Money is the cashier's, on `/pos` or in
 * the CMS; this screen is where an order is *worked*, so there is no `mark_paid`
 * here. Paying an order does not take it off the board either - `paid` and
 * `placed` are both worked from - so a ticket collected on at the counter stays
 * exactly where the cook left it, and only loses its "Unpaid" chip.
 */
import type { AdminOrderSummary } from "./admin-api";
import type { OrderStatus } from "./orders-shared";

/**
 * The two statuses a ticket can be worked from.
 *
 * `paid` is money in. `placed` is an offline order - pay in store or on
 * delivery - that the customer has committed to, which is exactly the order a
 * counter needs to start making. `pending` is deliberately absent: it is a
 * Stripe session that has been opened and may never be paid, so putting it on
 * the board asks a cook to make food nobody has bought yet. `failed`,
 * `canceled` and `refunded` are over.
 */
export const BOARD_STATUSES: readonly OrderStatus[] = ["paid", "placed"];

/** Whether one order belongs on the board at all - waiting or just done. */
export function isOnBoard(order: AdminOrderSummary): boolean {
  return BOARD_STATUSES.includes(order.status);
}

/** Whether one order is still to be made. */
export function isWaiting(order: AdminOrderSummary): boolean {
  return !order.fulfilled && isOnBoard(order);
}

/**
 * How many fulfilled tickets stay on the rail behind the waiting ones.
 *
 * A fulfilled ticket is **not** removed from the list: it drops to the bottom
 * and wears a "Fulfilled" badge, so an operator can see what has just gone out
 * and can undo a mistaken tap by opening it again. The cap is what keeps that
 * from growing into the whole tenant's order history - past twenty, a ticket is
 * `/admin/orders`' business, not a counter's.
 */
export const BOARD_FULFILLED_LIMIT = 20;

/**
 * The tickets still to be made, **oldest first** - the kitchen rule, and the
 * opposite of the CMS list's newest-first (which is a ledger, where the last
 * thing that happened is the interesting one). Here the oldest ticket is the one
 * with a customer waiting longest, so it has to be the one at the top.
 */
export function waitingOrders(
  orders: AdminOrderSummary[],
): AdminOrderSummary[] {
  return orders
    .filter(isWaiting)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/**
 * The latest `BOARD_FULFILLED_LIMIT` fulfilled tickets, most recent first - the
 * mirror image of the waiting rule, because here the *newest* is the one an
 * operator might still want back.
 *
 * Sorted by `fulfilled_at`, falling back to `created_at`: the column is null on
 * any order fulfilled before it existed, and an unparseable date must not sort
 * ahead of a real one.
 */
export function fulfilledOrders(
  orders: AdminOrderSummary[],
): AdminOrderSummary[] {
  return orders
    .filter((o) => o.fulfilled && isOnBoard(o))
    .sort((a, b) => fulfilledTime(b) - fulfilledTime(a))
    .slice(0, BOARD_FULFILLED_LIMIT);
}

function fulfilledTime(order: AdminOrderSummary): number {
  return Date.parse(order.fulfilled_at ?? order.created_at);
}

/**
 * How long a ticket has been waiting, in whole minutes. Clamped at zero: a
 * tablet whose clock runs behind the server's would otherwise show a brand-new
 * order as "-2m".
 */
export function minutesWaiting(createdAt: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60_000));
}

/**
 * How overdue a ticket is. Three levels rather than a raw number because a
 * glance across a mounted tablet reads colour, not digits.
 *
 * The thresholds are deliberately fixed rather than per-tenant: they are a
 * *presentation* nudge, not a promise about prep time, and a pizzeria's idea of
 * late belongs in the CMS beside a real prep-time field if it is ever wanted.
 */
export const WAITING_WARN_MINUTES = 10;
export const WAITING_LATE_MINUTES = 20;

export type WaitingLevel = "fresh" | "warn" | "late";

export function waitingLevel(minutes: number): WaitingLevel {
  if (minutes >= WAITING_LATE_MINUTES) return "late";
  if (minutes >= WAITING_WARN_MINUTES) return "warn";
  return "fresh";
}

/** The accent each waiting level is drawn in - the CMS order list's own scale,
 *  so green/amber/red mean the same thing on both screens. */
export const WAITING_COLOR: Record<WaitingLevel, string> = {
  fresh: "#22c55e",
  warn: "#f59e0b",
  late: "#ef4444",
};

/** What "done" is painted in, on both the rail row and the open ticket - the
 *  CMS order list's fulfilled green, so the badge means one thing everywhere. */
export const FULFILLED_COLOR = "#22c55e";

/**
 * The public ids in `orders` that `seen` has never held - the arrivals a poll
 * turned up. Pure so the board's "is this new?" rule is testable and cannot
 * quietly become "changed since last poll", which would re-announce an order
 * every time its total or status moved.
 */
export function arrivals(
  orders: AdminOrderSummary[],
  seen: ReadonlySet<string>,
): AdminOrderSummary[] {
  return orders.filter((o) => !seen.has(o.public_id));
}
