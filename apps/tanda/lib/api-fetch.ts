/**
 * The API fetcher lives in `@repo/auth` so all the frontends share one
 * refresh-and-retry implementation. Re-exported here because every route handler
 * imports it from `@/lib/api-fetch` (see apps/CLAUDE.md).
 */
export {
  apiFetch,
  refreshAccessToken,
  setAuthCookies,
  clearAuthCookies,
  type ApiFetchInit,
} from "@repo/auth/api-fetch";
