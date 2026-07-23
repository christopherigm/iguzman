import type { Metadata } from "next";
import { headers } from "next/headers";
import type { System } from "./system";
import { toShareDescription } from "./share";

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

/**
 * Open Graph / Twitter share metadata for a System-driven page - the landing
 * page and the per-site extra pages (e.g. `/about`). This is the tenant-level
 * counterpart to the item cards that product/service/menu detail pages build:
 * when someone pastes a tenant's home page URL into a chat or social post, the
 * scraper gets the tenant's about image, its name, and its slogan - so a shared
 * home page looks as finished as a shared product.
 *
 * Detail pages describe one item and keep building their own card; this only
 * covers pages that represent the site as a whole.
 */
export function systemShareMetadata({
  system,
  locale,
  origin,
  path = "",
  title,
}: {
  system: System | null;
  locale: string;
  origin: string;
  /** Path after the `/{locale}` segment, e.g. `/about`. Empty = landing page. */
  path?: string;
  /** Card/page title override; defaults to the tenant's site name. */
  title?: string;
}): Metadata {
  const siteName = system?.site_name ?? undefined;

  const siteDescription =
    (locale === "en" ? system?.en_site_description : system?.site_description) ??
    system?.site_description ??
    system?.en_site_description ??
    undefined;

  // Share cards favor the punchy slogan; fall back to the longer description.
  const shareDescription =
    toShareDescription(system?.slogan ?? siteDescription) ?? undefined;

  // The about image is the tenant's chosen "this is us" photo; fall back to the
  // hero, then the logo, so a share card always carries some brand imagery.
  const image =
    system?.img_about ?? system?.img_hero ?? system?.img_logo ?? undefined;

  const pageTitle = title ?? siteName;
  const url = `${origin}/${locale}${path}`;

  return {
    metadataBase: new URL(origin),
    title: pageTitle,
    description: siteDescription,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName,
      title: pageTitle,
      description: shareDescription,
      images: image
        ? [{ url: image, alt: siteName ?? pageTitle ?? "" }]
        : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: pageTitle,
      description: shareDescription,
      images: image ? [image] : undefined,
    },
  };
}
