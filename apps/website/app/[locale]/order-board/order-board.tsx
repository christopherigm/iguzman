"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  adminOrderAction,
  getAdminOrder,
  listAdminOrders,
  type AdminOrder,
  type AdminOrderAction,
  type AdminOrderSummary,
} from "@/lib/admin-api";
import { arrivals, fulfilledOrders, waitingOrders } from "@/lib/order-board";
import { orderRef } from "@/lib/orders-shared";
import { OrderBoardTopBar } from "./_components/order-board-top-bar";
import { OrderTicketList } from "./_components/order-ticket-list";
import { OrderTicketDetail } from "./_components/order-ticket-detail";
import { playChime, unlockAudio } from "./chime";
import "./order-board.css";

/**
 * How often the board re-asks. Twenty seconds is short enough that a customer
 * at the counter does not out-run the screen, and long enough that a tablet
 * left open all day makes a few thousand requests rather than a few hundred
 * thousand. There is no SSE endpoint for orders (unlike video-downloader's
 * task stream), so this is a plain poll; if one is ever added, this whole
 * effect is what it replaces.
 */
const POLL_MS = 20_000;

/** What the detail pane is showing - see the state's own comment below. */
type Selection =
  { kind: "auto" } | { kind: "picked"; id: string } | { kind: "none" };

/**
 * The board. Owns the ticket list, which ticket is open, and the polling that
 * keeps both honest.
 *
 * Three things it deliberately does not do:
 *
 * - **It writes no new state.** The only calls out are `mark_fulfilled` and
 *   `unmark_fulfilled` - two of the actions `/admin/orders` makes.
 * - **It takes no money.** Marking an order paid is the cashier's, on `/pos` or
 *   in the CMS. A ticket that is paid while it is being made simply loses its
 *   "Unpaid" chip on the next poll; it does not leave the board.
 * - **It never makes a ticket vanish under the finger that tapped it.** A
 *   fulfilled order drops to the bottom of the rail wearing a badge (the latest
 *   `BOARD_FULFILLED_LIMIT` of them), so a mistaken tap is undone by opening it
 *   again. The *pane* clears, because the thing it was showing is made.
 */
export function OrderBoard() {
  const t = useTranslations("OrderBoard");

  /** Every order for the tenant - the endpoint does not filter, and the extra
   *  rows are what let a poll refresh the open ticket without a second call. */
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Recomputed on every tick so the waiting times move on their own. */
  const [now, setNow] = useState(() => Date.now());

  /**
   * Which ticket the pane is showing, as one of three intents rather than a
   * nullable id - because "nothing is open" and "whatever is oldest" are
   * genuinely different answers and a single `null` cannot hold both.
   *
   * - `auto` - the board has not been told, so it shows the oldest waiting
   *   ticket and hands itself to the next one as that ticket leaves.
   * - `picked` - the operator tapped a row, including a fulfilled one.
   * - `none` - the pane is empty, which is where a just-fulfilled ticket leaves
   *   it: what it was showing has been made, so nothing on it is a live
   *   instruction any more.
   */
  const [selection, setSelection] = useState<Selection>({ kind: "auto" });
  const [detail, setDetail] = useState<AdminOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Below sm the detail is a full-screen sheet rather than a second column. */
  const [detailOpen, setDetailOpen] = useState(false);

  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
    id: number;
  } | null>(null);

  /**
   * Every public id the board has ever had on it. A `Set` rather than a diff
   * against the previous poll, so an order that is unfulfilled by mistake and
   * comes back does not chime a second time as if it were new.
   *
   * `null` until the first load has been folded in - see `refresh`.
   */
  const seen = useRef<Set<string> | null>(null);
  /** Read at chime time, so muting does not restart the poll interval. */
  const mutedRef = useRef(false);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const notify = useCallback(
    (message: string, variant: "success" | "error") => {
      setToast((prev) => ({ message, variant, id: (prev?.id ?? 0) + 1 }));
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const list = await listAdminOrders();
      setOrders(list);
      setError(null);

      // Arrivals are decided over the *waiting* tickets only. A fulfilled one
      // is not news - and now that it stays on the rail, folding it in here
      // would chime for every order the board has ever finished.
      const active = waitingOrders(list);
      const known = seen.current;
      if (known === null) {
        // First load. Everything already waiting was placed before this screen
        // opened, so none of it is an arrival - announcing a queue of ten as
        // ten new orders is noise, and the chime has to mean "one just came in".
        seen.current = new Set(active.map((o) => o.public_id));
        return;
      }

      const arrived = arrivals(active, known);
      for (const order of arrived) known.add(order.public_id);
      if (arrived.length === 0) return;

      if (!mutedRef.current) playChime();
      notify(
        arrived.length === 1
          ? t("newOrder", { ref: orderRef(arrived[0]!.public_id) })
          : t("newOrders", { count: arrived.length }),
        "success",
      );
    } catch {
      setError(t("errorLoad"));
    }
  }, [notify, t]);

  // The poll, plus the clock the waiting times are drawn from. One interval
  // drives both: the times are shown in whole minutes, so a separate faster
  // ticker would only repaint the same numbers.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      setNow(Date.now());
      // A board left open on a tablet that has been switched to another app
      // stops asking, and catches up the moment it is looked at again.
      if (document.hidden) return;
      await refresh();
    };

    void (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();

    const id = window.setInterval(() => void tick(), POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  /** Still to be made, oldest first - the top of the rail, and the count. */
  const waiting = useMemo(() => waitingOrders(orders), [orders]);
  /** Just gone out, newest first and capped - the bottom of the rail. */
  const fulfilled = useMemo(() => fulfilledOrders(orders), [orders]);

  /**
   * Which ticket is open. **Derived, never defaulted into state**: in `auto` an
   * order fulfilled on another tablet simply stops being the oldest waiting one
   * and the pane hands itself to the next, with no effect racing to correct a
   * stale selection.
   */
  const selectedId =
    selection.kind === "picked"
      ? selection.id
      : selection.kind === "auto"
        ? (waiting[0]?.public_id ?? null)
        : null;

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    void (async () => {
      // Inside the async body, not the effect's: a synchronous `setState` in an
      // effect body is a cascading render, which this repo's react-hooks config
      // rejects outright.
      setDetailLoading(true);
      try {
        const full = await getAdminOrder(selectedId);
        if (!cancelled) setDetail(full);
      } catch {
        if (!cancelled) setError(t("errorLoad"));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, t]);

  /**
   * The open ticket, with the two fields a poll can move folded in from the
   * list. The lines cannot change once an order exists, so there is nothing to
   * gain from refetching the detail every twenty seconds - but `fulfilled` and
   * `status` move under us the moment someone acts on the same order from the
   * CMS or another tablet, and the buttons below are drawn from them.
   *
   * Stale detail is dropped here, by id, rather than cleared from the fetching
   * effect: a `setState` in an effect body is a cascading render (and the rule
   * the repo's react-hooks config rejects), and deriving it also means the pane
   * never shows one ticket's lines under another ticket's reference while the
   * new one is in flight.
   */
  const shown = useMemo(() => {
    if (detail === null || detail.public_id !== selectedId) return null;
    const fresh = orders.find((o) => o.public_id === detail.public_id);
    return fresh === undefined
      ? detail
      : {
          ...detail,
          status: fresh.status,
          fulfilled: fresh.fulfilled,
          paid_at: fresh.paid_at,
          fulfilled_at: fresh.fulfilled_at,
        };
  }, [detail, orders, selectedId]);

  const runAction = useCallback(
    async (action: AdminOrderAction) => {
      if (shown === null) return;
      setBusy(true);
      try {
        const updated = await adminOrderAction(shown.public_id, action);
        setDetail(updated);
        if (action === "mark_fulfilled") {
          // The pane empties, because what it was showing has been made and
          // nothing on it is a live instruction any more. The ticket itself is
          // still on the rail, at the bottom, wearing its badge - that is where
          // the undo lives, so clearing the pane throws nothing away. On xs the
          // pane is a full-screen sheet, so it also has to get out of the way
          // of the list the operator now needs.
          setSelection({ kind: "none" });
          setDetailOpen(false);
          notify(
            t("fulfilledToast", { ref: orderRef(updated.public_id) }),
            "success",
          );
        } else {
          // An undo puts the ticket back in the queue - and keeps it open, so
          // the operator is looking at the order they just rescued.
          setSelection({ kind: "picked", id: updated.public_id });
        }
        await refresh();
      } catch {
        notify(t("errorAction"), "error");
      } finally {
        setBusy(false);
      }
    },
    [shown, refresh, notify, t],
  );

  const selectTicket = useCallback((publicId: string) => {
    setSelection({ kind: "picked", id: publicId });
    setDetailOpen(true);
  }, []);

  return (
    <Box
      className="order-board-shell"
      flexDirection="column"
      // The first tap anywhere is what lets the chime be heard at all - the
      // capture phase so a tap on a ticket unlocks audio *and* opens it.
      onClickCapture={unlockAudio}
    >
      <OrderBoardTopBar
        count={waiting.length}
        muted={muted}
        busy={busy}
        onToggleSound={() => setMuted((m) => !m)}
        onRefresh={() => void refresh()}
      />

      <Box className="order-board-body">
        <Box className="order-board-list-pane">
          <OrderTicketList
            waiting={waiting}
            fulfilled={fulfilled}
            selectedId={selectedId}
            now={now}
            loading={loading}
            error={error}
            onSelect={selectTicket}
          />
        </Box>

        {/* One detail pane, rendered once: the second column from sm up, the
            full-screen sheet below it, so the two layouts cannot show
            different tickets. */}
        <Box
          className={`order-board-detail-pane${
            detailOpen ? " order-board-detail-pane--open" : ""
          }`}
        >
          <OrderTicketDetail
            order={shown}
            loading={detailLoading}
            busy={busy}
            now={now}
            onAction={(action) => void runAction(action)}
            onClose={() => setDetailOpen(false)}
          />
        </Box>
      </Box>

      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          position="top-center"
          duration={4}
        />
      )}
    </Box>
  );
}
