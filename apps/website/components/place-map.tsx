"use client";

import { useTranslations } from "next-intl";
import { OsmMap } from "@repo/ui/core-elements/osm-map";
import { useBasemap } from "@/components/basemap-provider";

/**
 * A map of **one place**, with one pin on it.
 *
 * The single-pin map every surface in this app draws: each of the contact
 * page's locations, an event's venue, and the branch a booking is being made
 * at. It is one component rather than three because the three differ only in
 * the coordinate and the height - the labels, the pin and the basemap are the
 * same question answered the same way, and the copies this replaced had already
 * started to drift (the event map was `EventMap`, the contact page inlined its
 * own `OsmMap`).
 *
 * A thin **client** wrapper, so a server-rendered page can drop a map in
 * without becoming a client component itself: `OsmMap` paints OpenStreetMap
 * tiles into the page's own DOM and is necessarily interactive.
 *
 * The strings come from the **`Contact`** namespace, which is the one place
 * this app translates map chrome in all five locales. ⚠ The **attribution is
 * not among them**: it comes off the resolved basemap, because each tile
 * provider requires its own credit and it changes with the tile URL - a message
 * key cannot follow a setting an operator edits at runtime, and a CARTO map
 * credited "© OpenStreetMap contributors" is under-credited, which is a licence
 * problem rather than a copy one.
 *
 * No `renderPopup`: with one pin there is nothing for a card to add that the
 * address beside it does not already say - and omitting it is what makes the
 * marker a labelled image rather than a button that opens nothing.
 *
 * **Both map controls are on by default**, exactly as on `apps/animals`'
 * `SightingsMap`, and they wear `OsmMap`'s own default glyphs -
 * `/icons/location-arrow.svg`, `/icons/fullscreen.svg` and `/icons/close.svg`,
 * all of which this app ships. Every surface drawing this map answers "where is
 * this, relative to me?" - a branch on the contact page, a venue, the location a
 * booking is being made at - and locating the reader is a *button*: nothing here
 * asks the browser where anyone is until it is pressed, and a refusal, a device
 * with no fix and an insecure origin are all the same silent no-op.
 */
export function PlaceMap({
  latitude,
  longitude,
  title,
  pinIcon = null,
  height = 320,
  locateControl = true,
  fullscreenControl = true,
}: {
  latitude: number;
  longitude: number;
  /** What is at the coordinate - the pin's accessible name. May be empty. */
  title: string;
  /**
   * The mark drawn inside the pin - the tenant's **brandmark**, not its logo:
   * the pin's head is a 34 px circle that crops what it is given, so a wide
   * wordmark comes out as three letters from its own middle. With none, the pin
   * is a plain accent-coloured teardrop, which is fine.
   */
  pinIcon?: string | null;
  height?: number;
  /** Offer the button that pins the reader's own position. @default true */
  locateControl?: boolean;
  /** Offer the button that fills the screen with the map. @default true */
  fullscreenControl?: boolean;
}) {
  const t = useTranslations("Contact");
  const basemap = useBasemap();

  const name = title || t("mapTitle");

  return (
    <OsmMap
      markers={[{ id: 1, latitude, longitude, title: name, icon: pinIcon }]}
      height={height}
      locateControl={locateControl}
      fullscreenControl={fullscreenControl}
      tileUrl={basemap.tileUrl}
      tileFilter={basemap.filter}
      {...(basemap.attributionUrl
        ? { attributionUrl: basemap.attributionUrl }
        : {})}
      labels={{
        map: title ? t("mapOf", { name: title }) : t("mapTitle"),
        zoomIn: t("mapZoomIn"),
        zoomOut: t("mapZoomOut"),
        attribution: basemap.attribution,
        zoomHint: t("mapZoomHint"),
        zoomHintMac: t("mapZoomHintMac"),
        yourLocation: t("mapYourLocation"),
        locate: t("mapLocate"),
        enterFullscreen: t("mapFullscreen"),
        exitFullscreen: t("mapExitFullscreen"),
      }}
    />
  );
}
