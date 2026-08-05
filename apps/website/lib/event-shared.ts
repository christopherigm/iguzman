import type { Event } from "./events";

/**
 * The client-safe half of the events feature: formatting and the small
 * derivations a card needs.
 *
 * Split from `lib/events.ts` for exactly the reason `booking-shared.ts` is split
 * from `booking.ts` - the fetcher imports `resolve-site`, which reaches for
 * `next/headers`, and a `"use client"` component importing a runtime value from
 * that module would drag it into the browser bundle and fail the build.
 *
 * ⚠ **Every formatter here takes the event's own `timeZone` and none of them
 * falls back to the browser's.** An event happens at a particular hour in a
 * particular place, and a reader in another country must be shown the hour they
 * are expected to arrive - not that instant translated into their own zone.
 * This is the same rule the booking helpers follow, and it is the one thing a
 * bare `toLocaleString()` gets wrong every time.
 */

/**
 * When the event happens, as one line: `Sat, 14 Mar 2026, 19:00 CST`.
 *
 * `timeZoneName: "short"` is deliberate for a timed event, for the same reason
 * a booking carries it - an hour with no zone beside it is the ambiguity that
 * puts someone at a door an hour early. An **all-day** event has no hour to be
 * ambiguous about, so it is rendered as a bare date and the zone is dropped:
 * printing "CST" beside a date with no time reads as a mistake.
 */
export function formatEventStart(
  event: Pick<Event, "starts_at" | "is_all_day" | "timezone">,
  locale: string,
): string {
  const timeZone = event.timezone || "UTC";
  const date = new Date(event.starts_at);

  if (event.is_all_day) {
    return date.toLocaleDateString(locale, {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return date.toLocaleString(locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * The full span, collapsing to just the start when there is no announced end.
 *
 * An end on the **same local day** is rendered as a bare time (`19:00 - 22:00`)
 * rather than repeating the date, which is how a listing actually reads. A
 * multi-day run keeps both dates.
 */
export function formatEventRange(
  event: Pick<Event, "starts_at" | "ends_at" | "is_all_day" | "timezone">,
  locale: string,
): string {
  const start = formatEventStart(event, locale);
  if (!event.ends_at) return start;

  const timeZone = event.timezone || "UTC";
  const end = new Date(event.ends_at);

  if (sameLocalDay(new Date(event.starts_at), end, timeZone)) {
    // An all-day event that starts and ends on the same day is just that day.
    if (event.is_all_day) return start;
    return `${start} - ${end.toLocaleTimeString(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return `${start} - ${formatEventStart(
    { starts_at: event.ends_at, is_all_day: event.is_all_day, timezone: event.timezone },
    locale,
  )}`;
}

/**
 * A short label for a card's eyebrow: `14 Mar` / `14-16 Mar`.
 *
 * Deliberately no year and no time - a card is scanned, not read, and the full
 * span is on the detail page.
 */
export function formatEventDateShort(
  event: Pick<Event, "starts_at" | "ends_at" | "timezone">,
  locale: string,
): string {
  const timeZone = event.timezone || "UTC";
  const start = new Date(event.starts_at);
  const short = (d: Date) =>
    d.toLocaleDateString(locale, { timeZone, day: "numeric", month: "short" });

  if (!event.ends_at) return short(start);
  const end = new Date(event.ends_at);
  if (sameLocalDay(start, end, timeZone)) return short(start);
  return `${short(start)} - ${short(end)}`;
}

/**
 * Whether two instants fall on the same calendar day **in a given zone**.
 *
 * Compared through `en-CA`, whose short date format is ISO (`YYYY-MM-DD`), so
 * the comparison is a plain string equality on a stable shape rather than
 * arithmetic on a `Date` that has already lost the zone.
 */
function sameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  const key = (d: Date) => d.toLocaleDateString("en-CA", { timeZone });
  return key(a) === key(b);
}

/**
 * The place, as one line: the venue, the address, or both.
 *
 * Reads the **resolved** fields, which the API has already folded the event's
 * branch into - see the note at the top of `lib/events.ts`. Returns `null` when
 * an event has no location at all, so a caller can drop the row rather than
 * render an empty one.
 */
export function eventLocationLabel(
  event: Pick<Event, "venue_name" | "en_venue_name" | "address">,
  locale: string,
): string | null {
  const venue = (locale === "es" ? event.venue_name : event.en_venue_name) ||
    event.venue_name;
  const parts = [venue, event.address].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  if (parts.length === 0) return null;
  // A venue whose name *is* its address would otherwise print twice.
  if (parts.length === 2 && parts[0] === parts[1]) return parts[0]!;
  return parts.join(" - ");
}

/* ── Wall clock <-> instant (the CMS form's date inputs) ───────────────────── */

/**
 * The wall-clock reading of an instant **in a given zone**, expressed as the ms
 * value that same reading would have if it were UTC.
 *
 * The primitive both conversions below are built on. `Intl` can only *format*
 * into a zone, never parse out of one, so this formats the instant into the
 * zone's own Y/M/D h:m:s and re-assembles those numbers through `Date.UTC` -
 * giving a number whose difference from the real instant **is** the zone's
 * offset at that moment, DST included.
 */
function zonedAsUtcMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  // `hour12: false` renders midnight as "24" in some engines; `Date.UTC` would
  // read that as 1am the following day.
  const hour = get("hour") % 24;

  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
}

/**
 * `"2026-03-14T19:00"` typed in the CMS + `"America/Mexico_City"` -> the ISO
 * instant that wall clock names **there**.
 *
 * ⚠ This is why the form cannot just do `new Date(value).toISOString()`. A
 * `datetime-local` input hands back a wall clock with no zone attached, and
 * `new Date()` resolves it in the *browser's* zone - so an operator in Madrid
 * scheduling a 7pm event in Mexico City would file it for noon. The event's own
 * `timezone` is the only correct frame, and it is what this uses.
 *
 * The offset is looked up twice on purpose. The first pass assumes the wall
 * clock is UTC to find *an* offset; applying it can land on the other side of a
 * daylight-saving boundary, where the offset differs, so the second pass
 * re-reads it at the candidate instant. (An hour that DST skips entirely has no
 * instant to name; it resolves to the equivalent moment just past the jump,
 * which is what every calendar app does with it.)
 *
 * Returns `null` for anything that is not a wall clock, so a caller can drop the
 * field rather than send a fabricated date.
 */
export function wallClockToInstant(
  wallClock: string,
  timeZone: string,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wallClock);
  if (!match) return null;

  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const zone = timeZone || "UTC";

  const firstOffset = zonedAsUtcMs(new Date(asUtc), zone) - asUtc;
  let instant = asUtc - firstOffset;
  const secondOffset = zonedAsUtcMs(new Date(instant), zone) - instant;
  if (secondOffset !== firstOffset) instant = asUtc - secondOffset;

  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/**
 * The inverse: an ISO instant -> the `"YYYY-MM-DDTHH:mm"` a `datetime-local`
 * input wants, read in the event's own zone.
 *
 * So an event filed as 7pm in Mexico City loads back into the form as 19:00 for
 * every operator, wherever they are editing from.
 */
export function instantToWallClock(
  isoInstant: string | null,
  timeZone: string,
): string {
  if (!isoInstant) return "";
  const date = new Date(isoInstant);
  if (Number.isNaN(date.getTime())) return "";
  // `toISOString` on the shifted value gives the padded `YYYY-MM-DDTHH:mm:ss`
  // shape directly; the zone shift is already baked in by `zonedAsUtcMs`.
  return new Date(zonedAsUtcMs(date, timeZone || "UTC"))
    .toISOString()
    .slice(0, 16);
}

/**
 * Upcoming events first (soonest first), then the most recent past ones.
 *
 * The order a landing slider wants: what is coming up leads, and a tenant
 * between seasons still has something to show rather than an empty section.
 * `pastLimit` caps the tail so a decade of history does not bury the two events
 * that are actually next.
 */
export function orderForSlider(
  upcoming: Event[],
  past: Event[],
  pastLimit: number,
): Event[] {
  return [...upcoming, ...past.slice(0, pastLimit)];
}
