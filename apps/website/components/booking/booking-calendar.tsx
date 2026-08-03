"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { keyFromDate } from "@/lib/booking-shared";
import "./booking-calendar.css";

interface BookingCalendarProps {
  /** Local `YYYY-MM-DD` keys that have at least one free slot. Anything not in
   *  here is drawn disabled - a customer must never be able to pick a day that
   *  was only going to come back empty. */
  availableDays: Set<string>;
  /** The selected day's key, or null. */
  value: string | null;
  onChange: (dayKey: string) => void;
  /** Fired when the reader pages to another month, so the parent can fetch that
   *  month's availability. Receives the first day of the new month as a key. */
  onMonthChange: (firstDayKey: string) => void;
  /** Latest selectable date (the branch's booking horizon), as a key. */
  lastBookableDay?: string;
  loading?: boolean;
}

/** Monday-first, matching how `BranchHours.weekday` is numbered. */
const WEEKDAY_LABEL_KEYS = [
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
  "weekdaySun",
];

/** Monday=0 … Sunday=6, from JS's Sunday=0 … Saturday=6. */
function mondayFirstIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * A month grid for picking a booking day.
 *
 * Hand-rolled rather than reached for from a date-picker package on purpose:
 * the only thing this has to do that a native `<input type="date">` cannot is
 * **grey out the days that have no slots**, which is the entire point of showing
 * a calendar at all. Everything else here is a table of buttons.
 *
 * ⚠ **The day keys are plain calendar dates, not instants.** They arrive from
 * the API already resolved into the *branch's* timezone (see
 * `localDateKey`), and every comparison here is string-on-string against those
 * keys. Converting one to a `Date` and back through the browser's zone is how a
 * customer in another country ends up with the wrong square highlighted.
 */
export function BookingCalendar({
  availableDays,
  value,
  onChange,
  onMonthChange,
  lastBookableDay,
  loading = false,
}: BookingCalendarProps) {
  const t = useTranslations("Booking");
  const locale = useLocale();

  const [visibleMonth, setVisibleMonth] = useState<Date>(() =>
    startOfMonth(value ? new Date(`${value}T00:00:00`) : new Date()),
  );

  const todayKey = keyFromDate(new Date());

  const cells = useMemo(() => {
    const first = startOfMonth(visibleMonth);
    const daysInMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      0,
    ).getDate();
    // Blank leading cells so the 1st lands under its own weekday column.
    const lead = mondayFirstIndex(first);
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      out.push(
        keyFromDate(
          new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day),
        ),
      );
    }
    return out;
  }, [visibleMonth]);

  const goToMonth = (delta: number) => {
    const next = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + delta,
      1,
    );
    setVisibleMonth(next);
    onMonthChange(keyFromDate(next));
  };

  const monthLabel = visibleMonth.toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });

  // Paging back before the current month can only show days in the past, so the
  // control is disabled rather than left to produce an empty grid.
  const atFirstMonth =
    visibleMonth.getFullYear() === new Date().getFullYear() &&
    visibleMonth.getMonth() === new Date().getMonth();

  return (
    <Box flexDirection="column" gap={10} width="100%">
      <Box alignItems="center" justifyContent="space-between" gap={8}>
        <Button
          text="‹"
          size="md"
          aria-label={t("previousMonth")}
          disabled={atFirstMonth || loading}
          onClick={() => goToMonth(-1)}
        />
        <Typography variant="body" fontWeight={600} textAlign="center" flex="1">
          {monthLabel}
        </Typography>
        <Button
          text="›"
          size="md"
          aria-label={t("nextMonth")}
          disabled={loading}
          onClick={() => goToMonth(1)}
        />
      </Box>

      <Box
        display="grid"
        gap={4}
        width="100%"
        styles={{ gridTemplateColumns: "repeat(7, 1fr)" }}
      >
        {WEEKDAY_LABEL_KEYS.map((key) => (
          <Typography
            key={key}
            as="span"
            variant="label"
            textAlign="center"
            color="var(--foreground)"
          >
            {t(key)}
          </Typography>
        ))}

        {cells.map((dayKey, index) => {
          if (dayKey === null) {
            // A blank lead cell has no identity of its own; its
            // position in the month grid is all it is.
            return <Box key={`blank-${index}`} />;
          }
          const isPast = dayKey < todayKey;
          const beyondHorizon = lastBookableDay
            ? dayKey > lastBookableDay
            : false;
          const selectable =
            availableDays.has(dayKey) && !isPast && !beyondHorizon;
          const isSelected = dayKey === value;
          return (
            <Button
              key={dayKey}
              unstyled
              className={[
                "booking-day",
                selectable ? "booking-day--open" : "booking-day--closed",
                isSelected ? "booking-day--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!selectable}
              aria-pressed={isSelected}
              onClick={() => onChange(dayKey)}
            >
              {Number(dayKey.slice(8))}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
