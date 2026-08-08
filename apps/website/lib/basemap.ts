import {
  resolveBasemap,
  type Basemap,
  type BasemapFilter,
} from "@repo/ui/core-elements/basemaps";
import type { System } from "./system";

/**
 * The basemap this tenant is configured to draw, from its `System` row.
 *
 * A one-line wrapper on purpose: the *mapping* from three stored columns to a
 * `Basemap` belongs next to the styles themselves in `@repo/ui`, and what
 * belongs here is only the knowledge of which columns hold it. Called once, in
 * `[locale]/layout.tsx`, and handed to `BasemapProvider`.
 *
 * A tenant with no `System` at all (an unregistered host) gets the default
 * basemap rather than a blank map - the same tiles every map here drew before
 * the setting existed.
 *
 * A custom style is graded `'none'` - drawn exactly as it arrives. Anyone
 * pointing this at a style they authored has already chosen how the map should
 * look, and grading it again on the way in would undo that; the same reasoning
 * holds for a commercial provider's pale canvas. Only OSM's standard cartography
 * is loud enough to need the treatment, and it declares that for itself.
 */
export function basemapFor(system: System | null): Basemap {
  return resolveBasemap(system?.map_style, {
    tileUrl: system?.map_tile_url,
    attribution: system?.map_attribution,
    attributionUrl: system?.map_attribution_url,
    filter: "none" satisfies BasemapFilter,
  });
}
