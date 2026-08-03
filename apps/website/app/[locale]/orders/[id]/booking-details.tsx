import { getTranslations } from "next-intl/server";
import { Badge } from "@repo/ui/core-elements/badge";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import type { Booking, BookingStatus } from "@/lib/booking-shared";
import { formatBookingDateTime } from "@/lib/booking-shared";
import { formatPrice } from "@/lib/price";

/** The appointment axis has its own palette - see the note in `order-card.tsx`. */
const BOOKING_STATUS_COLORS: Record<BookingStatus, string> = {
  pending: "#f59e0b",
  confirmed: "#22c55e",
  completed: "#6b7280",
  canceled: "#ef4444",
};

interface BookingDetailsProps {
  booking: Booking;
  currency: string;
  locale: string;
}

/**
 * The appointment block on an order page: when, where, what was said, and what
 * is still owed.
 *
 * Rendered above the order lines rather than beside the summary, because for a
 * booking this *is* the order - the customer opened this page to check the time,
 * not the receipt.
 *
 * `amount_due_later` is shown whenever it is non-zero, including for a
 * pay-in-person booking where it is the whole price. That is the one number the
 * customer needs on the day and the one an order total does not tell them: the
 * total says what the service costs, this says what to bring.
 */
export async function BookingDetails({
  booking,
  currency,
  locale,
}: BookingDetailsProps) {
  const t = await getTranslations("Orders");

  const dueLater = Number(booking.amount_due_later);
  const dueNow = Number(booking.amount_due_now);

  return (
    <Card gap={14}>
      <Box
        alignItems="flex-start"
        justifyContent="space-between"
        gap={10}
        flexWrap="wrap"
      >
        <Typography as="h2" variant="h5" margin={0} color="var(--on-surface)">
          {t("bookingTitle")}
        </Typography>
        <Badge
          variant="subtle"
          size="sm"
          color={BOOKING_STATUS_COLORS[booking.status]}
        >
          {t(`bookingStatus_${booking.status}`)}
        </Badge>
      </Box>

      <Box height={1} flex="0 0 auto" backgroundColor="var(--border)" />

      <table className="item-specs-table">
        <tbody>
          <tr>
            <td>{t("bookingWhen")}</td>
            <td>
              {formatBookingDateTime(
                booking.starts_at,
                booking.timezone,
                locale,
              )}
            </td>
          </tr>
          <tr>
            <td>{t("bookingWhere")}</td>
            <td>
              {booking.fulfillment === "on_premises"
                ? booking.address || t("bookingAtYourAddress")
                : booking.branch_name || t("bookingMainLocation")}
            </td>
          </tr>
          <tr>
            <td>{t("bookingDuration")}</td>
            <td>{t("minutes", { count: booking.duration_minutes })}</td>
          </tr>
          {dueNow > 0 && (
            <tr>
              <td>{t("bookingPaidNow")}</td>
              <td>{formatPrice(booking.amount_due_now, currency)}</td>
            </tr>
          )}
          {dueLater > 0 && (
            <tr>
              <td>{t("bookingDueLater")}</td>
              <td>{formatPrice(booking.amount_due_later, currency)}</td>
            </tr>
          )}
          {booking.notes && (
            <tr>
              <td>{t("bookingNotes")}</td>
              <td>{booking.notes}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* The tenant is the only one who can move or cancel an appointment - the
          slot has to be handed back to the calendar, and a customer-side cancel
          button would need a policy (how late is too late) the tenant has not
          been asked for. So this points at the contact details rather than
          offering an action it cannot honour. */}
      <Typography variant="caption" color="var(--foreground)">
        {t("bookingChangeHint")}
      </Typography>
    </Card>
  );
}
