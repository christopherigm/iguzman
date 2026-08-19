import { cache } from "react";
import { getTenantHost } from "./resolve-site";
import { API_URL } from "./config";
import logger from "./logger";
import type { SectionDivider } from "@/components/section-band";
import type { SpotlightRef } from "./system";

/**
 * Homepage flyers - the promo slides the landing pages through.
 *
 * A flyer is the multi-record twin of `System.spotlight_*`: copy and a
 * photograph around a couple of hand-picked catalog items. What it adds is that
 * a tenant makes several, each with **its own** colour band and edge shapes -
 * `background` / `top_divider` / `bottom_divider` here are per row, where the
 * catalog and highlights bands are one setting on `System`.
 *
 * `items` are `{kind, id}` refs, the same shape the guest cart and the spotlight
 * use. They are resolved to live cards in `components/homepage-flyers.tsx`
 * against the cached catalog, so a picked item that has since been deleted or
 * disabled drops out of its slide instead of breaking the section.
 */
export interface HomepageFlyer {
  id: number;
  enabled: boolean;
  system: number | null;
  name: string | null;
  en_name: string | null;
  short_description: string | null;
  en_short_description: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  fit: string | null;
  background_color: string | null;
  href: string | null;
  items: SpotlightRef[];
  /** Which side the photograph sits on from `sm` up. */
  image_side: "left" | "right";
  /** Raw CSS for this flyer's band; null means no band. */
  background: string | null;
  top_divider: SectionDivider;
  bottom_divider: SectionDivider;
  sort_order: number;
}

/**
 * Every enabled flyer of the current tenant, in the CMS's own order.
 *
 * `React.cache` dedupes repeated asks within one render and holds nothing
 * between requests - the only cache in front of this API is the API's own,
 * which its `signals`/view invalidation clears on every write.
 *
 * A failure answers `[]`, the list contract every section fetcher here follows:
 * the band is one of several on a landing, and the page survives without it.
 */
export const getHomepageFlyers = cache(async (): Promise<HomepageFlyer[]> => {
  const host = await getTenantHost();

  try {
    const res = await fetch(`${API_URL}/api/homepage-flyers/`, {
      headers: { "X-Website-Host": host },
      cache: "no-store",
    });

    if (!res.ok) {
      logger.warn(
        { host, status: res.status },
        "Homepage flyers API returned non-OK status",
      );
      return [];
    }

    return res.json() as Promise<HomepageFlyer[]>;
  } catch (err) {
    logger.error({ host, err }, "Failed to fetch homepage flyers");
    return [];
  }
});
