"use client";

/**
 * Image loader: send stored media straight to the CDN, keep everything else on
 * the built-in optimizer.
 *
 * In production every uploaded file lives in Cloudflare R2 and the API hands
 * back an **absolute** URL on the bucket's own hostname (the platform's, or the
 * tenant's own when it has connected its own R2 - see
 * `apps/website-api/core/storage.py`). Passing those through `/_next/image`
 * would drag every image back through this pod on its first request, which is
 * exactly the round-trip R2 exists to remove: the file is already sitting on a
 * Cloudflare edge next to the visitor. So an absolute URL is returned untouched
 * and the browser fetches it directly.
 *
 * ⚠ **Everything else is returned untouched too, including relative paths.**
 * Declaring a custom loader makes Next 404 `/_next/image` unconditionally
 * (`next-server` bails out of the optimizer for any `loader !== 'default'`), so
 * emitting that route's URL shape "for local assets" produces a 404 and a blank
 * image rather than an optimized one. A `/public` asset is simply served as it
 * was committed.
 *
 * Two consequences worth knowing:
 *
 * * **No per-viewport resizing, for stored media or local art.** The API caps
 *   every upload at its tier (`core/image_sizes.py`: 256 - 3840 px), so what is
 *   stored is what is served; commit `/public` art at roughly its drawn size and
 *   give large images an explicit `sizes` so the browser at least does not lay
 *   out for the biggest one.
 * * **`/_next/image` is not available as a same-origin proxy.** The features
 *   that need *same-origin pixels* - the flyer exports (`html-to-image` taints
 *   the canvas otherwise) and the branch map capture - go through this app's own
 *   `/api/media` route instead; see `lib/same-origin-image.ts`.
 */
export default function mediaImageLoader({ src }: { src: string }): string {
  return src;
}
