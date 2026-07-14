/**
 * The API fetcher lives in `@repo/auth` so all three frontends share one
 * refresh-and-retry implementation. Re-exported here because every route handler
 * imports it from `@/lib/api-fetch` (see apps/CLAUDE.md).
 */
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
 * The tenant this request belongs to. Every website-api auth endpoint is scoped
 * by `system_id`; resolving it here (from the request host) keeps it off the
 * wire - the browser can no longer pick which tenant it authenticates against.
 */
export async function getSystemId(): Promise<number> {
  const system = await getSystem();
  return system?.id ?? 1;
}
