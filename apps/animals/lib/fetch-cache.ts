/**
 * The one place this app decides how long a backend response may be reused.
 *
 * There are **two** caches between an author and a reader, and turning off only
 * one of them changes nothing they can see:
 *
 * 1. animals-api's response cache (Redis in production), cleared by the receivers
 *    in each Django app's `signals.py` the moment a row is written.
 * 2. Next's data cache, right here - which has no idea a write happened, and
 *    would keep serving the payload it already has for the full `revalidate`
 *    window regardless.
 *
 * So in development this is `no-store`: an edit made in the Django admin is on
 * the next page load, which is the only cadence that makes authoring bearable.
 * In production it is a 5-minute revalidate, matching the API's own TTL - a
 * public journal is read far more often than it is written, and the pair puts a
 * worst-case ceiling of ten minutes on a change appearing. If that ever matters,
 * revalidate this app on write with a tag rather than shortening the window.
 *
 * `NODE_ENV` rather than a custom flag: `next dev` sets it to `development` and
 * `next build` to `production`, so no `.env` has to be right for this to behave.
 */
export const CATALOG_REVALIDATE = 300;

export function cacheOptions(revalidate = CATALOG_REVALIDATE): RequestInit {
  if (process.env.NODE_ENV === 'development') return { cache: 'no-store' };
  return { next: { revalidate } };
}
