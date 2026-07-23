import { cache } from "react";
import { getTenantHost } from "./resolve-site";
import { API_URL } from "./config";
import logger from "./logger";
import type { Branch } from "./contact";

/**
 * The branches for the current request's tenant, main location first.
 * `React.cache()` dedupes the contact page + its metadata within one request.
 *
 * Server-only: it reaches Django by request host through `getTenantHost`, whose
 * site registry must never enter a client bundle. Kept out of `lib/contact.ts`
 * so the client-safe contact helpers (types, `sendContactMessage`) can be
 * imported by `"use client"` components without pulling this chain in.
 */
export const getBranches = cache(async (): Promise<Branch[]> => {
  const host = await getTenantHost();
  try {
    const res = await fetch(`${API_URL}/api/branches/`, {
      headers: { "X-Website-Host": host },
    });
    if (!res.ok) {
      // 404 here just means the host has no System yet - an empty list is the
      // right answer, not an error the page should surface.
      if (res.status !== 404) {
        logger.warn({ host, status: res.status }, "Branches API non-OK status");
      }
      return [];
    }
    return (await res.json()) as Branch[];
  } catch (err) {
    logger.error({ host, err }, "Failed to fetch branches");
    return [];
  }
});
