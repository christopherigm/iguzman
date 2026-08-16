/**
 * The API fetcher lives in `@repo/auth` so all three frontends share one
 * refresh-and-retry implementation. Re-exported here because every route handler
 * imports it from `@/lib/api-fetch` (see apps/CLAUDE.md).
 */
import { NextResponse } from "next/server";
import { getSystem } from "./system";

export {
  apiFetch,
  refreshAccessToken,
  setAuthCookies,
  clearAuthCookies,
  reissueTokens,
  type ApiFetchInit,
} from "@repo/auth/api-fetch";

export {
  COOKIE_OPTS,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
} from "@repo/auth/tokens";

/**
 * The tenant this request belongs to, or `null` when the host matches no
 * System. Every website-api auth endpoint is scoped by `system_id`; resolving
 * it here (from the request host) keeps it off the wire - the browser can no
 * longer pick which tenant it authenticates against.
 *
 * ⚠ **An unresolved tenant must never be substituted for a real one.** This used
 * to fall back to `1`, which is not a neutral default - it is a real customer.
 * Django's login builds the username from what it is sent
 * (`build_username(system_id, email)`), so the fallback did not just mislabel
 * the session: it signed the caller in as System 1's admin, put `systemId: 1`
 * on the token, and every row the CMS wrote from then on (a menu item, a
 * category, a product) was saved onto that customer. In development it looked
 * like nothing had saved at all - the storefront resolves by host and never
 * showed the rows - while locally on `localhost:3000`, which matches no
 * `System.host`, it silently did this on every single login.
 *
 * Callers must refuse the request when this is `null` rather than guessing. In
 * development, set `DEV_SITE` (see `lib/resolve-site.ts`) to name the site to
 * work on, or pick one with the dev site switcher.
 */
export async function getSystemId(): Promise<number | null> {
  const system = await getSystem();
  return system?.id ?? null;
}

/**
 * The refusal every `getSystemId()` caller returns when the tenant is
 * unresolved. One shared body so the five auth handlers cannot drift into
 * describing the same misconfiguration differently.
 *
 * 503 rather than 400: nothing is wrong with the request. Either the host does
 * not match any `System.host` (in development, `localhost` matches none - name
 * the site with `DEV_SITE` or the dev site switcher) or website-api could not
 * be reached at all. The `detail` is deliberately actionable: this only ever
 * surfaces to a developer or an operator, since in production the host is by
 * definition one the ingress routed here.
 */
export function unresolvedTenantResponse(): NextResponse {
  return NextResponse.json(
    {
      detail:
        "This site's tenant could not be resolved from the request host. " +
        "In development, set DEV_SITE in apps/website/.env to a site slug " +
        "(or pick one with the dev site switcher) and sign in again.",
    },
    { status: 503 },
  );
}
