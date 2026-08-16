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
 * domain to this single app (see cli/website/website.sh sync), and this
 * function maps that host to the right site folder.
 *
 * In development ONLY, two things can force a specific site by slug, so any
 * site can be previewed on `127.0.0.1:3000` where the request host matches
 * nothing. Both are ignored in production - real deploys always resolve by host.
 *
 * 1. The `__dev_site` cookie, set by the dev site switcher. It wins, because it
 *    is the interactive choice someone just made in the browser.
 * 2. The `DEV_SITE` env var (a slug, from `.env`), which is the baseline when
 *    no cookie is set.
 *
 * ⚠ **`DEV_SITE` exists because the cookie cannot cover the request that
 * matters most: the login.** The CMS's tenant is a `systemId` claim minted at
 * login from the request's resolved System, and Django's login builds the
 * *username* from it (`build_username(system_id, email)`) - so an unresolved
 * tenant does not merely mislabel the session, it signs you in as a different
 * customer's admin account and every row the CMS then writes lands on that
 * customer. A visitor who has not yet touched the site switcher has no cookie,
 * which is exactly the state a fresh `pnpm dev` login is in.
 */
export const getSite = cache(async (): Promise<SiteModule> => {
  if (process.env.NODE_ENV === "development") {
    const devSlug =
      (await cookies()).get(DEV_SITE_COOKIE)?.value || process.env.DEV_SITE;
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
