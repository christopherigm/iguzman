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
 * Everything else - `/public` assets, anything relative - still goes to the
 * built-in optimizer, so local images keep their resizing and modern formats.
 *
 * Two consequences worth knowing:
 *
 * * **No per-viewport resizing for stored media.** The API already caps every
 *   upload at its tier (`core/image_sizes.py`: 256 - 3840 px), so what is stored
 *   is what is served. Give large images an explicit `sizes` so the browser at
 *   least does not lay out for the biggest one.
 * * **`/_next/image` still works and is still needed.** Two features route a
 *   remote image through it deliberately, to get a *same-origin* copy: the
 *   social-post flyer export (`html-to-image` taints the canvas otherwise) and
 *   the hero's `logo`-shape CSS mask (a cross-origin mask resolves to an empty
 *   mask and clips the badge away). Both therefore still need their media host
 *   listed in `next.config.js` → `images.remotePatterns`.
 */
export default function mediaImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  // Already on a CDN (or a data: URI) - hand it to the browser as it is.
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;

  // The default loader's own URL shape, so local assets are unaffected by this
  // file existing.
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`;
}
