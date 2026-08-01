'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  BASEMAPS,
  DEFAULT_BASEMAP,
  type Basemap,
} from '@repo/ui/core-elements/basemaps';

/**
 * The one basemap every map in this app draws, published to the whole tree.
 *
 * **Why a context rather than a prop.** Five components render a map here - the
 * four public `SightingsMap`s and the CMS's `MapPicker`, which is itself mounted
 * on two admin forms *and* on the public place-contribution form. The setting
 * behind them is a single `System` field, so threading it would mean adding a
 * prop to every one of those call sites and a `getSystem()` to the pages that
 * host them, including client components that cannot call it at all. The layout
 * already reads `getSystem()` (request-cached) to paint the palette, the fonts
 * and the watermark; the basemap rides along with them.
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
 * with the old `Map.attribution` message under-credits whoever is actually
 * serving the tiles.
 */
export function useBasemap(): Basemap {
  return useContext(BasemapContext);
}
