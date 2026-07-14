/**
 * Django API base URL. Server-side only - never NEXT_PUBLIC_.
 *
 * This used to be NEXT_PUBLIC_API_URL, which shipped the API host to the browser
 * and got baked in at build time. Every consumer here is a server component or a
 * route handler, so a runtime, server-only variable is both safer and correct for
 * a k8s secret. Matches cinelog and edge-folio.
 */
export { apiUrl } from "@repo/auth/tokens";

export const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";
