import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { getTenantHost } from "@/lib/resolve-site";
import logger from "@/lib/logger";

/**
 * The bookable slots for a service at a branch, over a run of dates.
 *
 * Deliberately **not** an `apiFetch` route, and deliberately unauthenticated: a
 * visitor picks an appointment before they have any reason to sign in, so this
 * has to work with no session at all - exactly like `/api/guest/resolve`.
 *
 * `X-Website-Host` comes from `getTenantHost()`, never from the query string:
 * which tenant's calendar is being read is not the browser's to choose.
 *
 * The query is forwarded rather than rebuilt so the API stays the single place
 * that decides what a valid range is (it clamps `days` and refuses a service
 * that is not bookable). Re-validating here would be a second opinion that could
 * only drift from the first.
 */
export async function GET(request: NextRequest) {
  const host = await getTenantHost();
  const search = request.nextUrl.search;

  try {
    const res = await fetch(`${API_URL}/api/bookings/availability/${search}`, {
      headers: { "X-Website-Host": host },
      cache: "no-store",
    });
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    logger.error({ err, host }, "Failed to load booking availability");
    return NextResponse.json(
      { detail: "Could not load available times." },
      { status: 502 },
    );
  }
}
