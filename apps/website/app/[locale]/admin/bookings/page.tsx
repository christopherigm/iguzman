"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "@repo/auth/session-provider";
import { Badge } from "@repo/ui/core-elements/badge";
import { Box } from "@repo/ui/core-elements/box";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Select } from "@repo/ui/core-elements/select";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  adminBookingAction,
  listAdminBookings,
  listBranches,
  reassignBooking,
  type AdminBooking,
  type AdminBookingAction,
  type BookingStatus,
} from "@/lib/admin-api";
import { formatBookingDateTime } from "@/lib/booking-shared";
import { formatPrice } from "@/lib/price";

/** The accent each appointment state is drawn in. Kept apart from the order
 *  status colours on `/admin/orders`: these are two different axes, and giving
 *  a confirmed booking the same green as a paid order would suggest the money
 *  had arrived. */
const STATUS_COLOR: Record<BookingStatus, string> = {
  pending: "#f59e0b",
  confirmed: "#22c55e",
  completed: "#6b7280",
  canceled: "#ef4444",
};

/** The list's own view filter, not an API concept - `upcoming` and `all` both
 *  ask for the same statuses and differ only in the date floor. */
type Filter = "upcoming" | "pending" | "all";

/** One resource an operator may move a booking onto, flattened out of the
 *  branches payload (which already nests pools and their resources). */
interface ResourceOption {
  id: number;
  label: string;
  branchId: number;
}

export default function AdminBookingsPage() {
  const t = useTranslations("AdminBookings");
  const locale = useLocale();

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("upcoming");
  // Which row is mid-action, so only its own buttons spin rather than the page
  // blanking while a tenant confirms one of thirty appointments.
  const [busyId, setBusyId] = useState<number | null>(null);
  const systemId = useSession()?.systemId ?? 0;
  // Every resource the tenant has, keyed by branch below. Loaded once: the list
  // may show thirty appointments across a handful of locations, and a request
  // per row would be thirty round trips for one dropdown.
  const [resources, setResources] = useState<ResourceOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `from` is today's *local* date, which is the right floor for a screen a
      // tenant reads in its own city. The API compares it against UTC instants,
      // so an appointment early tomorrow morning can never fall off the list.
      const today = new Date();
      const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const data = await listAdminBookings(
        filter === "all"
          ? undefined
          : filter === "pending"
            ? { status: ["pending"], from }
            : { status: ["pending", "confirmed"], from },
      );
      setBookings(data);
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const branches = await listBranches(systemId);
        setResources(
          branches.flatMap((branch) =>
            (
              (branch.resource_pools as
                | {
                    name: string;
                    unit_label: string | null;
                    enabled: boolean;
                    resources: {
                      id: number;
                      name: string;
                      capacity: number;
                      enabled: boolean;
                    }[];
                  }[]
                | undefined) ?? []
            )
              .filter((pool) => pool.enabled)
              .flatMap((pool) =>
                pool.resources
                  .filter((r) => r.enabled)
                  .map((r) => ({
                    id: r.id,
                    // The pool's own noun where it has one ("boat"), so the
                    // dropdown reads in the tenant's vocabulary rather than in
                    // ours.
                    label: `${r.name} (${pool.unit_label || pool.name} · ${r.capacity})`,
                    branchId: branch.id as number,
                  })),
              ),
          ),
        );
      } catch {
        // A failure here costs the reassign dropdown and nothing else, so the
        // page must not show an error for it - the appointments still list.
        setResources([]);
      }
    })();
  }, [systemId]);

  const act = async (id: number, action: AdminBookingAction) => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await adminBookingAction(id, action);
      // Patched in place rather than refetching: the list may be filtered to
      // "upcoming", and a reload would make a just-cancelled booking vanish
      // before the operator has seen that the action worked.
      setBookings((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b)),
      );
    } catch {
      setError(t("errorAction"));
    } finally {
      setBusyId(null);
    }
  };

  const reassign = async (
    booking: AdminBooking,
    resourceId: number | null,
    force = false,
  ) => {
    setBusyId(booking.id);
    setError(null);
    try {
      const updated = await reassignBooking(booking.id, resourceId, force);
      setBookings((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b)),
      );
    } catch {
      // The API refuses a move that does not fit, and the operator can retry it
      // with the overbook confirmation - so this says the move failed, not that
      // the action is broken.
      setError(t("errorReassign"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("title") },
        ]}
      />
      <Typography as="h1" variant="h1" marginBottom={20}>
        {t("title")}
      </Typography>

      <Box marginBottom={20} maxWidth={280}>
        <Select
          label={t("filterLabel")}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "upcoming", label: t("filterUpcoming") },
            { value: "pending", label: t("filterPending") },
            { value: "all", label: t("filterAll") },
          ]}
        />
      </Box>

      {error && (
        <Typography
          variant="body"
          color="var(--error, #ef4444)"
          marginBottom={16}
        >
          {error}
        </Typography>
      )}

      {loading ? (
        <Box alignItems="center" gap={10}>
          <Spinner />
          <Typography variant="body">{t("loading")}</Typography>
        </Box>
      ) : bookings.length === 0 ? (
        <Typography variant="body">{t("empty")}</Typography>
      ) : (
        <Box flexDirection="column" gap={12}>
          {bookings.map((booking) => (
            <Card key={booking.id} gap={12}>
              <Box
                justifyContent="space-between"
                alignItems="flex-start"
                gap={12}
                flexWrap="wrap"
              >
                <Box flexDirection="column" gap={4} flex="1" minWidth={220}>
                  <Typography variant="h5" fontWeight={700}>
                    {formatBookingDateTime(
                      booking.starts_at,
                      booking.timezone,
                      locale,
                    )}
                  </Typography>
                  <Typography variant="body">{booking.service_name}</Typography>
                </Box>
                <Badge
                  variant="subtle"
                  size="sm"
                  color={STATUS_COLOR[booking.status]}
                >
                  {t(`status_${booking.status}`)}
                </Badge>
              </Box>

              <table className="item-specs-table">
                <tbody>
                  <tr>
                    <td>{t("customer")}</td>
                    <td>
                      {booking.customer_name || booking.customer_email || "—"}
                      {booking.customer_phone
                        ? ` · ${booking.customer_phone}`
                        : ""}
                    </td>
                  </tr>
                  <tr>
                    <td>{t("where")}</td>
                    <td>
                      {booking.fulfillment === "on_premises"
                        ? `${t("atCustomer")}: ${booking.address || "—"}`
                        : booking.branch_name || t("mainLocation")}
                    </td>
                  </tr>
                  <tr>
                    <td>{t("duration")}</td>
                    <td>{t("minutes", { count: booking.duration_minutes })}</td>
                  </tr>
                  {/* Only for a real party: printing "1 person" on every
                      appointment at a salon is noise. */}
                  {booking.party_size > 1 && (
                    <tr>
                      <td>{t("partySize")}</td>
                      <td>{t("people", { count: booking.party_size })}</td>
                    </tr>
                  )}
                  {booking.resource_name && (
                    <tr>
                      <td>{booking.resource_unit_label || t("resource")}</td>
                      <td>{booking.resource_name}</td>
                    </tr>
                  )}
                  <tr>
                    <td>{t("payment")}</td>
                    <td>
                      {t(`payment_${booking.payment_option}`)}
                      {booking.payment_option === "deposit"
                        ? ` (${booking.deposit_percent}%)`
                        : ""}
                      {" · "}
                      {t("dueNow")}:{" "}
                      {formatPrice(booking.amount_due_now, booking.currency)}
                      {" · "}
                      {t("dueLater")}:{" "}
                      {formatPrice(booking.amount_due_later, booking.currency)}
                    </td>
                  </tr>
                  {booking.notes && (
                    <tr>
                      <td>{t("notes")}</td>
                      <td>{booking.notes}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <Box gap={8} flexWrap="wrap" alignItems="center">
                <Button
                  text={t("viewOrder")}
                  href={`/admin/orders/${booking.order_public_id}`}
                  size="md"
                />
                {/* A cancelled or completed booking is done with; offering the
                    transitions again would only invite an accidental reopen. */}
                {booking.status === "pending" && (
                  <Button
                    text={t("confirm")}
                    kind="primary"
                    size="md"
                    disabled={busyId === booking.id}
                    onClick={() => void act(booking.id, "confirm")}
                  />
                )}
                {(booking.status === "pending" ||
                  booking.status === "confirmed") && (
                  <>
                    <Button
                      text={t("complete")}
                      kind="success"
                      size="md"
                      disabled={busyId === booking.id}
                      onClick={() => void act(booking.id, "complete")}
                    />
                    <Button
                      text={t("cancel")}
                      kind="error"
                      size="md"
                      disabled={busyId === booking.id}
                      onClick={() => void act(booking.id, "cancel")}
                    />
                  </>
                )}
                {busyId === booking.id && <Spinner size={16} />}
              </Box>

              {/* Reassignment. Rendered only where there is somewhere to move
                to - a branch with no pools has one implicit resource and
                nothing to choose between - and only while the appointment is
                still live, which is the same rule the API enforces. */}
              {(booking.status === "pending" ||
                booking.status === "confirmed") &&
                resources.some((r) => r.branchId === booking.branch) && (
                  <ReassignControl
                    booking={booking}
                    options={resources.filter(
                      (r) => r.branchId === booking.branch,
                    )}
                    disabled={busyId === booking.id}
                    onReassign={(resourceId, force) =>
                      void reassign(booking, resourceId, force)
                    }
                  />
                )}
            </Card>
          ))}
        </Box>
      )}
    </>
  );
}

/**
 * The "move this party to another boat" row on one booking.
 *
 * Two buttons rather than one: **Move** re-validates through the availability
 * engine and refuses a resource that cannot take the party, while **Overbook**
 * asks for a confirmation first and then puts them there anyway. Keeping them
 * apart is the point - the safe action must not quietly become the unsafe one
 * because a seat count happened to be tight, and the override must be something
 * an operator chose rather than something they fell into.
 *
 * Local to this page: it reads nothing but its props and has exactly one
 * consumer, which is the threshold `apps/CLAUDE.md` sets for staying beside the
 * route that uses it.
 */
function ReassignControl({
  booking,
  options,
  disabled,
  onReassign,
}: {
  booking: AdminBooking;
  options: ResourceOption[];
  disabled: boolean;
  onReassign: (resourceId: number | null, force: boolean) => void;
}) {
  const t = useTranslations("AdminBookings");
  const [choice, setChoice] = useState<string>(
    booking.resource != null ? String(booking.resource) : "",
  );
  const [confirmingOverbook, setConfirmingOverbook] = useState(false);

  const resourceId = choice === "" ? null : Number(choice);
  const unchanged = resourceId === booking.resource;

  return (
    <Box flexDirection="column" gap={10} paddingTop={10}>
      {/* Divider: a 1px filled Box rather than a border, so the rule stays in
        props - the same shape the catalog card uses. */}
      <Box height={1} flex="0 0 auto" backgroundColor="var(--border)" />
      <Box gap={10} flexWrap="wrap" alignItems="flex-end">
        <Box flex="1" minWidth={220}>
          <Select
            label={t("reassignLabel")}
            value={choice}
            onChange={setChoice}
            options={[
              { value: "", label: t("reassignNone") },
              ...options.map((r) => ({ value: String(r.id), label: r.label })),
            ]}
          />
        </Box>
        <Button
          text={t("reassign")}
          size="md"
          disabled={disabled || unchanged}
          onClick={() => onReassign(resourceId, false)}
        />
        <Button
          text={t("overbook")}
          kind="warning"
          size="md"
          disabled={disabled || unchanged}
          onClick={() => setConfirmingOverbook(true)}
        />

        {confirmingOverbook && (
          <ConfirmationModal
            title={t("overbookTitle")}
            text={t("overbookText", { party: booking.party_size })}
            okLabel={t("overbookConfirm")}
            cancelLabel={t("cancelAction")}
            okCallback={() => {
              setConfirmingOverbook(false);
              onReassign(resourceId, true);
            }}
            cancelCallback={() => setConfirmingOverbook(false)}
          />
        )}
      </Box>
    </Box>
  );
}
