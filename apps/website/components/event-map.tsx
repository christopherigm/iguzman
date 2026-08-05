"use client";

import { useTranslations } from "next-intl";
import { OsmMap } from "@repo/ui/core-elements/osm-map";

/**
 * The single pin on an event's detail page.
 *
 * A thin client wrapper so the server-rendered page can drop a map in without
 * becoming a client component itself - `OsmMap` draws OpenStreetMap tiles into
 * the page's own DOM and is necessarily interactive.
 *
 * The strings come from the **`Contact`** namespace, which already carries every
 * label this map needs (`mapTitle`, the zoom controls, the attribution, the
 * gesture hints) and is the one place they are translated in all five locales.
 * Duplicating them under `Events` would leave two copies of an attribution the
 * tile provider requires to be exact.
 *
 * No `renderPopup`: with one pin there is nothing for a card to add that the
 * address and the directions button above it do not already say - and omitting
 * it is what makes the marker a labelled image rather than a button.
 */
export function EventMap({
  latitude,
  longitude,
  title,
  pinIcon = null,
  height = 320,
}: {
  latitude: number;
  longitude: number;
  /** The event's name - the pin's accessible label. */
  title: string;
  /**
   * The mark drawn inside the pin - the tenant's **brandmark**, not its logo:
   * the pin's head is a 34 px circle that crops what it is given, so a wide
   * wordmark comes out as three letters from its own middle.
   */
  pinIcon?: string | null;
  height?: number;
}) {
  const t = useTranslations("Contact");

  return (
    <OsmMap
      markers={[{ id: 1, latitude, longitude, title, icon: pinIcon }]}
      height={height}
      labels={{
        map: t("mapOf", { name: title }),
        zoomIn: t("mapZoomIn"),
        zoomOut: t("mapZoomOut"),
        attribution: t("mapAttribution"),
        zoomHint: t("mapZoomHint"),
        zoomHintMac: t("mapZoomHintMac"),
      }}
    />
  );
}
