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
 * `/_next/image` is that same-origin door. A custom loader does not disable the
 * optimizer route - only `output: 'export'` does - so it still answers, which is
 * exactly why `next.config.js` keeps its `remotePatterns` list. ⚠ **A tenant on
 * its own R2 hostname must have that hostname in `remotePatterns`**, or this
 * falls back to the un-proxied URL and whatever canvas it feeds is tainted.
 *
 * Two consumers, which is why it is here rather than beside either of them:
 * the social-post flyer export (`admin/social-posts/[id]`) and the branch map
 * capture (`lib/map-capture.ts`).
 */

/**
 * `url` as a `data:` URL fetched from this origin, or the original URL when it
 * cannot be proxied.
 *
 * **Returning the original on failure is deliberate**: both callers can still
 * *show* the image (an `<img>` has no same-origin rule), and only the export
 * step is lost. A thrown error here would take the whole preview with it.
 */
export async function toSameOriginDataUrl(
  url: string,
  { width = 1080, quality = 90 }: { width?: number; quality?: number } = {},
): Promise<string> {
  if (url.startsWith("data:")) return url;
  try {
    const optimized = `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
    const res = await fetch(optimized);
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
