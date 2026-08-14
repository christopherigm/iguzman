/**
 * Reading a remote image back as a **same-origin** data URL.
 *
 * ⚠ This exists for one reason: a `<canvas>` that has drawn a cross-origin image
 * is *tainted*, and `toDataURL` / `toBlob` on a tainted canvas throw
 * `SecurityError` rather than returning anything. Every stored image on this
 * site is absolute on an R2/CDN hostname (`images.loader: 'custom'`, see
 * `image-loader.ts`), so anything that has to end up **inside** a canvas has to
 * be fetched through this app first.
 *
 * ⚠ **That door is `/api/media`, not `/_next/image`.** Next only serves the
 * optimizer route for the default loader - with a custom one it 404s
 * `/_next/image` outright, `images.remotePatterns` notwithstanding. This helper
 * used to point there, which worked in development (media served same-origin
 * from localhost, so the fallback below was already same-origin) and failed in
 * production on every tenant: the 404 dropped it back to the raw CDN URL, and
 * the export then died on `No 'Access-Control-Allow-Origin' header` because a
 * customer's own bucket serves no CORS headers.
 *
 * Two consumers, which is why it is here rather than beside either of them:
 * the flyer exports (`admin/social-posts/[id]`, `admin/coupons/[id]`) and the
 * branch map capture (`lib/map-capture.ts`).
 */

/**
 * `url` as a `data:` URL fetched from this origin, or the original URL when it
 * cannot be proxied.
 *
 * **Returning the original on failure is deliberate**: both callers can still
 * *show* the image (an `<img>` has no same-origin rule), and only the export
 * step is lost. A thrown error here would take the whole preview with it.
 *
 * There is no width/quality to ask for: `/api/media` is a passthrough, not an
 * optimizer, and website-api already caps every upload at its tier.
 */
export async function toSameOriginDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  // A relative path is this origin already - a `/public` asset, most often -
  // and needs no round-trip through the proxy to prove it.
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const proxied = `/api/media?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxied);
    if (!res.ok) return url;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}
