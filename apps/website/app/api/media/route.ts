import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/media?url=<absolute media URL> - the same-origin door for stored media.
 *
 * ⚠ **This exists because `/_next/image` does not answer in this app.** Next
 * serves the optimizer route only for the default loader; with
 * `images.loader: 'custom'` (which is how stored media goes straight to the R2
 * edge - see `image-loader.ts`) `next-server` 404s `/_next/image`
 * unconditionally, whatever `images.remotePatterns` says. So the two features
 * that need *same-origin pixels* rather than a fast image - the flyer exports
 * (`html-to-image` cannot read a canvas that has drawn a cross-origin image) and
 * the branch map capture - had no door at all in production: `toSameOriginDataUrl`
 * fell back to the raw CDN URL, and the export then failed on a CORS error
 * because a tenant bucket (`r2.<customer>.com`) serves no
 * `Access-Control-Allow-Origin`. In development the media host is localhost, so
 * everything was already same-origin and nothing ever failed there.
 *
 * It is a **byte-for-byte passthrough**, not an optimizer: it resizes nothing.
 * website-api already caps every upload at its tier (`core/image_sizes.py`), so
 * what is stored is what a flyer draws.
 *
 * ⚠ **Not an open proxy.** `isAllowedMediaHost` below is the whole guard; keep
 * it narrow, and keep the `image/*` content-type check - between them they are
 * what stops this being an SSRF hole and a way to launder arbitrary bytes
 * through the site's own origin.
 */

/**
 * Media on the company domain: the platform R2 bucket and website-api itself,
 * which serve every tenant that has not connected storage of its own.
 */
const PLATFORM_MEDIA_SUFFIX = ".iguzman.com.mx";

/**
 * An escape hatch for a tenant whose CDN is on an unrelated domain (a bare
 * `pub-….r2.dev`, say). Comma-separated hostnames; empty in every deployment so
 * far, because a customer that connects its own bucket puts it on its own
 * domain, which the rule below covers with no configuration at all.
 */
const EXTRA_HOSTS = (process.env.MEDIA_PROXY_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/** `host` header → bare hostname (no port, no `www.`). */
function normalizeHost(host: string | null): string {
  return (host ?? "")
    .split(":")[0]!
    .toLowerCase()
    .replace(/^www\./, "");
}

/**
 * Whether this app may fetch `target` on behalf of the page served at
 * `requestHost`.
 *
 * The tenant rule is the one that matters: a customer's media lives on a
 * subdomain of the site's own domain (`r2.elpanbueno.com` for `elpanbueno.com`),
 * so onboarding one needs no config here - which is exactly what
 * `images.remotePatterns` could never manage, being baked in at build time.
 */
function isAllowedMediaHost(target: URL, requestHost: string): boolean {
  const host = target.hostname.toLowerCase();

  // In development the request host is `127.0.0.1`, which is a subdomain of
  // nothing, while the dev site switcher previews any customer against the real
  // API and its real bucket. Every rule below would refuse that pairing, and a
  // proxy that only works in production is a proxy nobody can test.
  if (process.env.NODE_ENV === "development") return true;

  if (host === requestHost || host === `www.${requestHost}`) return true;
  if (requestHost && host.endsWith(`.${requestHost}`)) return true;
  if (host.endsWith(PLATFORM_MEDIA_SUFFIX)) return true;
  if (EXTRA_HOSTS.includes(host)) return true;

  return false;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ detail: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ detail: "Invalid url" }, { status: 400 });
  }

  const requestHost = normalizeHost(request.headers.get("host"));
  const isLocal =
    target.hostname === "localhost" || target.hostname === "127.0.0.1";
  if (target.protocol !== "https:" && !(isLocal && target.protocol === "http:")) {
    return NextResponse.json({ detail: "Invalid url" }, { status: 400 });
  }
  if (!isAllowedMediaHost(target, requestHost)) {
    return NextResponse.json({ detail: "Host not allowed" }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { cache: "no-store", redirect: "follow" });
  } catch {
    return NextResponse.json({ detail: "Fetch failed" }, { status: 502 });
  }

  // A redirect can leave the allowlist; re-check where we actually landed.
  try {
    if (!isAllowedMediaHost(new URL(upstream.url), requestHost)) {
      return NextResponse.json({ detail: "Host not allowed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ detail: "Fetch failed" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !upstream.body || !contentType.startsWith("image/")) {
    return NextResponse.json(
      { detail: "Not an image" },
      { status: upstream.ok ? 415 : upstream.status },
    );
  }

  const headers = new Headers({
    "Content-Type": contentType,
    // Stored media is immutable in practice (uploads land under a fresh uuid),
    // and the only callers read each URL once per page - an hour is plenty and
    // keeps a re-download of the same flyer off the network.
    "Cache-Control": "public, max-age=3600",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new NextResponse(upstream.body, { status: 200, headers });
}
