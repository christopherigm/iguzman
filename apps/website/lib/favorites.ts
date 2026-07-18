/**
 * The signed-in user's saved products and services.
 *
 * These read through `apiFetch`, which attaches the bearer token from the
 * HTTP-only cookie. They are safe to call from a server component because
 * `createAuthProxy` has already refreshed an expired access token earlier in the
 * same request - so `apiFetch`'s own refresh path (which writes cookies, and a
 * server component may not) is not reached. The try/catch is the belt to that
 * braces: a failure degrades to "no favorites" instead of a 500, matching how
 * `lib/catalog.ts` treats an unreachable API.
 *
 * Each catch must call `unstable_rethrow` first. Next signals "this route read
 * cookies, so it cannot be prerendered" by *throwing*; swallowing that tells the
 * build the route rendered fine with no favorites, and it gets baked into a
 * static page that shows every user an empty list forever.
 */
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getSession } from "@repo/auth/session";
import { apiFetch } from "./api-fetch";
import type {
  FeaturedProduct,
  FeaturedService,
  MenuItemDetail,
} from "./catalog";
import logger from "./logger";

export type FavoriteItem =
  | { id: number; kind: "product"; created_at: string; item: FeaturedProduct }
  | { id: number; kind: "service"; created_at: string; item: FeaturedService }
  | { id: number; kind: "menu_item"; created_at: string; item: MenuItemDetail };

export interface FavoriteIds {
  products: number[];
  services: number[];
  menu_items: number[];
}

const EMPTY_IDS: FavoriteIds = { products: [], services: [], menu_items: [] };

export const getFavorites = cache(async (): Promise<FavoriteItem[]> => {
  try {
    const res = await apiFetch("/api/auth/favorites/", { cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 401) {
        logger.warn(
          { status: res.status },
          "Favorites API returned non-OK status",
        );
      }
      return [];
    }
    return (await res.json()) as FavoriteItem[];
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err }, "Failed to fetch favorites");
    return [];
  }
});

/**
 * Just the saved ids, for the detail pages' and catalog cards' on/off check -
 * fetching the full favorites payload to answer one boolean would pull every
 * saved item's images and variants on every product view.
 */
export const getFavoriteIds = cache(async (): Promise<FavoriteIds> => {
  // An anonymous visitor has no favorites, and every catalog card asks. Without
  // this the whole catalog costs one round-trip that can only come back 401.
  if ((await getSession()) === null) return EMPTY_IDS;

  try {
    const res = await apiFetch("/api/auth/favorites/ids/", {
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status !== 401) {
        logger.warn(
          { status: res.status },
          "Favorite ids API returned non-OK status",
        );
      }
      return EMPTY_IDS;
    }
    return (await res.json()) as FavoriteIds;
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err }, "Failed to fetch favorite ids");
    return EMPTY_IDS;
  }
});

/** Whether `id` is saved, for a logged-out user always false. */
export async function isFavorite(
  kind: "product" | "service" | "menu_item",
  id: number,
): Promise<boolean> {
  const ids = await getFavoriteIds();
  if (kind === "product") return ids.products.includes(id);
  if (kind === "service") return ids.services.includes(id);
  return ids.menu_items.includes(id);
}
