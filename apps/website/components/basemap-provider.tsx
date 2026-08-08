"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  BASEMAPS,
  DEFAULT_BASEMAP,
  type Basemap,
} from "@repo/ui/core-elements/basemaps";

/**
 * The one basemap every map on this tenant's site draws, published to the whole
 * tree.
 *
 * **Why a context rather than a prop.** Three components render a map here - the
 * contact page's locations, an event's pin and the booking page's map of the
 * chosen branch - and each is a client component several levels below a page
 * that may not fetch `getSystem()` at all. The setting behind them is a single
 * `System` field, so threading it would mean a prop at every call site plus a
 * fetch on every host page. The locale layout already reads `getSystem()`
 * (request-cached) to paint the palette, the fonts and the watermark; the
 * basemap rides along with them.
 *
 * ⚠ **The default is not a placeholder.** A component rendered outside the
 * provider - a test, a future route group with its own layout - gets OSM's
 * standard tiles rather than an empty map, which is the same thing every map
 * here drew before the setting existed.
 */
const BasemapContext = createContext<Basemap>(BASEMAPS[DEFAULT_BASEMAP]);

export function BasemapProvider({
  basemap,
  children,
}: {
  basemap: Basemap;
  children: ReactNode;
}) {
  return (
    <BasemapContext.Provider value={basemap}>
      {children}
    </BasemapContext.Provider>
  );
}

/**
 * The tile template, its required credit and its grading, as one record.
 *
 * ⚠ Take all three from here. The credit is not decoration and not a
 * translation: each provider requires its own string, so pairing a new tile URL
 * with the old `Contact.mapAttribution` message under-credits whoever is
 * actually serving the tiles.
 */
export function useBasemap(): Basemap {
  return useContext(BasemapContext);
}
