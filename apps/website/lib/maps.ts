/**
 * Links out to a map application, for the one thing this site's own maps cannot
 * do: turn-by-turn directions.
 *
 * Client-safe (no `next/headers`, no fetchers), because the surfaces that need
 * it are a mix - the contact page's locations are a client component, an event's
 * venue and an order's location are server ones, and the same URL is built again
 * in `website-api`'s order email.
 */

/**
 * Google Maps' universal directions URL for a coordinate.
 *
 * ⚠ **Coordinates, never the address.** A tenant's address is free text and a
 * geocoder makes of it what it will - a beach shack with a descriptive address
 * lands a customer in the wrong town. The pin an operator dropped in the CMS is
 * the location; this points at it.
 *
 * Google rather than the tenant's own basemap: this is the "get me there" hand-
 * off, and it has to open something the customer's phone will route with. The
 * `?api=1` form is the documented, key-less one and is honoured by both the app
 * and the web client.
 */
export function directionsHref(
  latitude: string | number,
  longitude: string | number,
): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}
