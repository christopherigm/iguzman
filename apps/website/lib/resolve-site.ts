import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  DEV_SITE_COOKIE,
  resolveSiteByHost,
  resolveSiteBySlug,
} from "@/sites/registry";
import type { SiteModule } from "@/sites/types";

/**
 * Returns the site module for the current request, resolved by host and
 * memoized per request (React.cache) so the landing dispatcher, the catch-all
 * page dispatcher, and any metadata hook share a single resolution.
 *
 * Multi-tenancy is host-based end-to-end: the ingress routes every registered
 * domain to this single app (see scripts/sync-website-hosts.mjs), and this
 * function maps that host to the right site folder.
 *
 * In development ONLY, a `__dev_site` cookie (set by the dev site switcher)
 * forces a specific site by slug, so any site can be previewed on
 * `127.0.0.1:3000` where the request host matches nothing. The cookie is
 * ignored in production - real deploys always resolve by host.
 */
export const getSite = cache(async (): Promise<SiteModule> => {
  if (process.env.NODE_ENV === "development") {
    const devSlug = (await cookies()).get(DEV_SITE_COOKIE)?.value;
    if (devSlug) {
      const devSite = await resolveSiteBySlug(devSlug);
      if (devSite) return devSite;
    }
  }

  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0] ?? "";
  return resolveSiteByHost(host);
});

/**
 * The host the backend should use to resolve this request's tenant data, sent
 * as `X-Website-Host` by every `lib/` data helper. Prefers the resolved site's
 * `systemHost` (so a preview/staging domain still loads the customer's real
 * System record) and falls back to the raw request host. Memoized per request.
 */
export const getTenantHost = cache(async (): Promise<string> => {
  const site = await getSite();
  if (site.config.systemHost) return site.config.systemHost;
  const headersList = await headers();
  return (headersList.get("host") ?? "").split(":")[0] ?? "";
});
