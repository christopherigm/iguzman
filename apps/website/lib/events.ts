import { cache } from "react";
import { getTenantHost } from "./resolve-site";
import { API_URL } from "./config";
import logger from "./logger";

/**
 * Events - the tenant's dated happenings (a tasting, a workshop, a live set).
 *
 * Purely informational: nothing here joins, reserves or pays for anything. The
 * shape mirrors `lib/success-stories.ts` because an event *is* that family of
 * content - it just carries a date and a place.
 *
 * ⚠ **The location fields arrive resolved.** `venue_name`, `address` and the
 * coordinates each fall back to the event's branch on the API side (see
 * `Event.effective_*` in website-api's `core/models.py`), so a page renders one
 * answer and never has to ask which of the two ways of naming a place this row
 * used. The raw columns travel as `own_*` and are for the CMS form only - a
 * public page reading those would show a blank address for every event held at
 * one of the tenant's own branches.
 */

export interface EventImage {
  id: number;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  href: string | null;
  fit: string | null;
  background_color: string | null;
  sort_order: number;
}

export interface Event {
  id: number;
  enabled: boolean;
  created: string;
  modified: string;
  system: number | null;
  name: string | null;
  en_name: string | null;
  short_description: string | null;
  en_short_description: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  fit: string | null;
  background_color: string | null;
  /**
   * The frame this record's photographs are drawn in ("" = auto, which is what
   * every record carries until an operator says otherwise). Resolve it with
   * `aspectRatioValue` from `lib/aspect-ratio.ts`; never parse it inline.
   */
  aspect_ratio: string;
  href: string | null;
  slug: string | null;

  /** The tenant location this is held at, when it is held at one. */
  branch: number | null;
  branch_name: string | null;
  branch_en_name: string | null;

  /** Resolved across the branch - render these, never the `own_*` pair. */
  venue_name: string | null;
  en_venue_name: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;

  /** The row's own values. For the CMS form; blank means "inherit the branch's". */
  own_venue_name: string | null;
  own_en_venue_name: string | null;
  own_address: string | null;
  own_latitude: string | null;
  own_longitude: string | null;

  /** ISO-8601 instants. Render them through the event's own `timezone`. */
  starts_at: string;
  ends_at: string | null;
  is_all_day: boolean;
  /** IANA name the two instants above are local to. */
  timezone: string;

  /**
   * Whether the event is over, decided by the API against its own timezone -
   * including the all-day rule that keeps it current until the end of its local
   * day. Never re-derive this from `starts_at` in the browser: an all-day event
   * is stored at midnight, so a naive comparison retires it on the morning it
   * runs.
   */
  is_past: boolean;
  effective_end: string;

  is_featured: boolean;
  images: EventImage[];
}

/** Which slice of the calendar to ask for; see `_event_queryset` in the API. */
export type EventScope = "upcoming" | "past" | "all";

interface EventsQuery {
  scope?: EventScope;
  limit?: number;
}

async function fetchEvents({ scope, limit }: EventsQuery): Promise<Event[]> {
  const host = await getTenantHost();
  const params = new URLSearchParams();
  if (scope && scope !== "all") params.set("scope", scope);
  if (limit) params.set("limit", String(limit));
  const query = params.size > 0 ? `?${params}` : "";

  try {
    const res = await fetch(`${API_URL}/api/events/${query}`, {
      headers: { "X-Website-Host": host },
      cache: "no-store",
    });

    if (!res.ok) {
      logger.warn(
        { host, scope, status: res.status },
        "Events API returned non-OK status",
      );
      return [];
    }

    return res.json() as Promise<Event[]>;
  } catch (err) {
    logger.error({ host, scope, err }, "Failed to fetch events");
    // A list feeds a section the page survives without - see `getEvent` for the
    // detail contract, which is deliberately not this one.
    return [];
  }
}

/**
 * Events that have not finished yet, soonest first.
 *
 * `React.cache` dedupes repeated asks within one render (a landing that shows
 * the slider and a page that also counts them), and holds nothing between
 * requests - the only cache in front of this API is the API's own.
 */
export const getUpcomingEvents = cache(
  async (limit?: number): Promise<Event[]> =>
    fetchEvents({ scope: "upcoming", limit }),
);

/** Events that are over, most recent first. */
export const getPastEvents = cache(
  async (limit?: number): Promise<Event[]> => fetchEvents({ scope: "past", limit }),
);

/** Every event, in chronological order. */
export const getEvents = cache(
  async (limit?: number): Promise<Event[]> => fetchEvents({ scope: "all", limit }),
);

export const getEvent = cache(async (slug: string): Promise<Event | null> => {
  const host = await getTenantHost();

  try {
    const res = await fetch(`${API_URL}/api/events/slug/${slug}/`, {
      headers: { "X-Website-Host": host },
      cache: "no-store",
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      logger.warn(
        { host, slug, status: res.status },
        "Event by slug API returned non-OK status",
      );
      return null;
    }

    return res.json() as Promise<Event>;
  } catch (err) {
    logger.error({ host, slug, err }, "Failed to fetch event by slug");
    return null;
  }
});
