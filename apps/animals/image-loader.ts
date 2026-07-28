'use client';

/**
 * Image loader: send stored media straight to the CDN, and serve everything
 * else straight off this origin. Nothing is optimized in between.
 *
 * In production every uploaded file lives in Cloudflare R2 and the API hands
 * back an **absolute** URL on the bucket's own hostname (see the media block in
 * the API's `settings.py`). Passing those through `/_next/image` would drag
 * every image back through this pod on its first request, which is exactly the
 * round-trip R2 exists to remove: the file is already sitting on a Cloudflare
 * edge next to the visitor. So an absolute URL is returned untouched and the
 * browser fetches it directly.
 *
 * Everything else - `/public` assets, anything relative - is also returned as
 * it is, and served straight off this app's static route.
 *
 * Two consequences worth knowing:
 *
 * * **No per-viewport resizing, for any image.** What is stored (or committed
 *   under `/public`) is what is served. Give large images an explicit `sizes`
 *   so the browser at least does not lay out for the biggest one, and commit
 *   `/public` art at roughly the size it is drawn at.
 * * **`/_next/image` does not exist in this app.** Setting `images.loader` to
 *   anything other than `'default'` makes Next 404 that route outright
 *   (`next/dist/server/next-server.js` -> `if (imagesConfig.loader !== 'default'
 *   || imagesConfig.unoptimized) return this.render404(...)`). So it cannot be
 *   used to obtain a *same-origin* copy of a remote image - if something here
 *   ever needs that (an `html-to-image`/canvas export taints on a cross-origin
 *   fetch; a cross-origin CSS `mask-image` resolves to an empty mask), it needs
 *   its own proxy route, not this URL.
 */
export default function mediaImageLoader({ src }: { src: string; width: number; quality?: number }): string {
  // Whether it is on the CDN, a data: URI, or a `/public` asset on this origin,
  // the URL already points at the bytes - there is no optimizer to route it
  // through, so hand every one of them to the browser untouched.
  return src;
}
