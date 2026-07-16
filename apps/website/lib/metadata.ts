import { headers } from "next/headers";

/**
 * Absolute origin of the current request, e.g. `https://acme.com`.
 *
 * Metadata needs absolute URLs - a share scraper has no page context to resolve
 * a relative path against - and this app is multi-tenant by host, so the origin
 * can only come from the request. Behind the k8s ingress the pod sees its own
 * host, so the `x-forwarded-*` headers win when present.
 */
export async function getRequestOrigin(): Promise<string> {
  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
  const proto =
    headersList.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  return `${proto}://${host}`;
}

/** Cut-off for share-card copy. Facebook/X truncate well before this anyway. */
const SHARE_DESCRIPTION_MAX = 200;

/**
 * Collapses a catalog description into one-line share-card copy: whitespace
 * squashed, cut on a word boundary near {@link SHARE_DESCRIPTION_MAX}. The
 * backend has no short-description field, so the long body is all we have.
 */
export function toShareDescription(
  description: string | null | undefined,
): string | undefined {
  const text = description?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= SHARE_DESCRIPTION_MAX) return text;

  const clipped = text.slice(0, SHARE_DESCRIPTION_MAX);
  const lastSpace = clipped.lastIndexOf(" ");
  // Guard against a single very long word leaving us with almost nothing.
  const cut =
    lastSpace > SHARE_DESCRIPTION_MAX * 0.6 ? lastSpace : clipped.length;
  return `${clipped.slice(0, cut).trimEnd()}…`;
}
