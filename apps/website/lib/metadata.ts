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

// Re-exported so existing server callers keep importing it from here; the
// implementation moved to `lib/share.ts` so client components can use it too.
export { toShareDescription } from "./share";
