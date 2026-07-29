"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { Link } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Button } from "@repo/ui/core-elements/button";
import { Select } from "@repo/ui/core-elements/select";
import { Typography } from "@repo/ui/core-elements/typography";
import { OsmMap, type OsmMapMarker } from "@repo/ui/core-elements/osm-map";
import "./sightings-map.css";

/**
 * Every pinned journal entry on one map, with each marker wearing its
 * **species' icon**.
 *
 * The map itself is `@repo/ui`'s `OsmMap` - OpenStreetMap raster tiles painted
 * into its own DOM, so the markers are ours to draw (the keyless Google embed it
 * replaced was a cross-origin iframe, which nothing on the page could draw over
 * or read a click inside). What is left here is the journal's half of it: the
 * filter row above the map, and the card a pin opens.
 *
 * Two things worth knowing before changing it:
 *
 * - **The filters narrow the pins that were loaded, they never re-query.** The
 *   dropdown options are built from the marker set itself, so a species that is
 *   not on the map is not in the list - and picking one shows that species'
 *   pins *among these*, not its full history. The alternative (refetching per
 *   selection) buys a longer history at the cost of a loading state on every
 *   change and an unbounded pin count; a map is a frame, not a search.
 * - **A single-pin map still comes through here**, from a sighting's own page,
 *   with `filters={[]}`. It gets the same pin, the same card and the same
 *   gestures as the map of a whole category - one map component, not two.
 * - **Both map controls are on by default here**, and the icons they wear are
 *   `OsmMap`'s own defaults - `/icons/location-arrow.svg`, `/icons/fullscreen.svg`
 *   and `/icons/close.svg`, all of which this app ships. Locating the reader is
 *   a *button* now: nothing on these pages asks the browser where anyone is
 *   until it is pressed.
 */

/**
 * One entry on the map. Every string arrives **already resolved for the locale**
 * - including the date, which is formatted server-side so the entry's calendar
 * day cannot shift under the visitor's timezone (the API publishes a bare
 * `YYYY-MM-DD`, which `new Date()` would read as UTC midnight).
 */
export interface SightingMarker extends OsmMapMarker {
  id: number;
  /** The entry's own page - where the popup's button leads. */
  href: string;
  title: string;
  speciesName: string | null;
  categoryName: string | null;
  locationName: string | null;
  dateLabel: string;
  /** The calendar year, for the year filter - `date.slice(0, 4)`. */
  year: string;
  /** The species' glyph, falling back to its category's. */
  icon: string | null;
  /** The marker's colour when there is no glyph at all. */
  color: string | null;
  /** The entry's cover, for the popup card. */
  image: string | null;
  latitude: number;
  longitude: number;
  /** Whether the API blurred this pin to ~1 km (a protected place). */
  approximate: boolean;
}

/** Which dropdowns to offer. A filter with fewer than two values is dropped. */
export type SightingsMapFilter = "category" | "species" | "location" | "year";

interface Props {
  markers: SightingMarker[];
  filters?: SightingsMapFilter[];
  /** Height of the map viewport. @default 420 */
  height?: number;
  /**
   * Deepest zoom the initial framing may choose. Left to `OsmMap`'s default
   * unless the caller knows something about its pins - a sighting page backs it
   * off for a coordinate the API has already blurred to ~1 km.
   */
  maxFitZoom?: number;
  /**
   * Offer the button that pins the reader's own position. @default true
   *
   * On by default because "is any of this near me?" is the question a field
   * journal's map is read with - a pin over the next valley means something the
   * same pin over a country does not. It is a **button**, not something the map
   * does on its own: the permission dialog now costs a click, so arriving on a
   * page that happens to carry a map costs nothing at all.
   */
  locateControl?: boolean;
  /** Offer the button that fills the screen with the map. @default true */
  fullscreenControl?: boolean;
  labels: {
    map: string;
    zoomIn: string;
    zoomOut: string;
    attribution: string;
    close: string;
    all: string;
    category: string;
    species: string;
    location: string;
    year: string;
    empty: string;
    approximate: string;
    seeDetail: string;
    /** Names the visitor's own pin - see `locateControl` above. */
    yourLocation: string;
    /** Names the three map controls: locate, and both faces of the fullscreen toggle. */
    locate: string;
    fullscreen: string;
    exitFullscreen: string;
    /** The scrim a bare wheel raises. Both are passed; the client picks one. */
    zoomHint: string;
    zoomHintMac: string;
  };
}

type Selection = Record<SightingsMapFilter, string>;

const NO_SELECTION: Selection = {
  category: "",
  species: "",
  location: "",
  year: "",
};

export function SightingsMap({
  markers,
  filters = ["category", "species", "location", "year"],
  height = 420,
  maxFitZoom,
  locateControl = true,
  fullscreenControl = true,
  labels,
}: Props) {
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);

  // Built from the markers themselves: the dropdowns describe what is on the
  // map, so an option that would empty it is never offered in the first place.
  const options = useMemo(() => {
    const pick: Record<
      SightingsMapFilter,
      (m: SightingMarker) => string | null
    > = {
      category: (m) => m.categoryName,
      species: (m) => m.speciesName,
      location: (m) => m.locationName,
      year: (m) => m.year,
    };
    const out = {} as Record<SightingsMapFilter, string[]>;
    for (const filter of filters) {
      const values = new Set<string>();
      for (const marker of markers) {
        const value = pick[filter](marker);
        if (value) values.add(value);
      }
      // Years read newest first, like the feed they came from; the rest read
      // alphabetically in the visitor's own locale.
      out[filter] =
        filter === "year"
          ? [...values].sort().reverse()
          : [...values].sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [markers, filters]);

  const visible = useMemo(
    () =>
      markers.filter(
        (m) =>
          (!selection.category || m.categoryName === selection.category) &&
          (!selection.species || m.speciesName === selection.species) &&
          (!selection.location || m.locationName === selection.location) &&
          (!selection.year || m.year === selection.year),
      ),
    [markers, selection],
  );

  const setFilter = useCallback((filter: SightingsMapFilter, value: string) => {
    setSelection((current) => ({ ...current, [filter]: value }));
  }, []);

  // Only the filters that have something to choose between: a dropdown offering
  // one species is a control that can only ever be a no-op.
  const shownFilters = filters.filter(
    (filter) => (options[filter]?.length ?? 0) > 1,
  );

  return (
    <Box flexDirection="column" gap={12} width="100%">
      {shownFilters.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={12} alignItems="flex-end">
          {shownFilters.map((filter) => (
            <Select
              key={filter}
              label={labels[filter]}
              value={selection[filter]}
              onChange={(value) => setFilter(filter, value)}
              options={[
                { value: "", label: labels.all },
                ...(options[filter] ?? []).map((value) => ({
                  value,
                  label: value,
                })),
              ]}
              flex={1}
              minWidth={150}
              maxWidth={240}
            />
          ))}
        </Box>
      )}

      <OsmMap
        markers={visible}
        height={height}
        {...(maxFitZoom ? { maxFitZoom } : {})}
        locateControl={locateControl}
        fullscreenControl={fullscreenControl}
        labels={{
          map: labels.map,
          zoomIn: labels.zoomIn,
          zoomOut: labels.zoomOut,
          attribution: labels.attribution,
          zoomHint: labels.zoomHint,
          zoomHintMac: labels.zoomHintMac,
          empty: labels.empty,
          yourLocation: labels.yourLocation,
          locate: labels.locate,
          enterFullscreen: labels.fullscreen,
          exitFullscreen: labels.exitFullscreen,
        }}
        renderPopup={(marker, close) => (
          <MarkerCard marker={marker} labels={labels} onClose={close} />
        )}
      />
    </Box>
  );
}

/** The card a marker opens: what was seen, where, when, and the way in. */
function MarkerCard({
  marker,
  labels,
  onClose,
}: {
  marker: SightingMarker;
  labels: Props["labels"];
  onClose: () => void;
}) {
  return (
    <Card padding={0} gap={0} styles={{ overflow: "hidden" }}>
      {marker.image && (
        <Box
          height={104}
          width="100%"
          styles={{ position: "relative", overflow: "hidden" }}
        >
          <Image
            src={marker.image}
            alt=""
            fill
            unoptimized
            style={{ objectFit: "cover" }}
          />
        </Box>
      )}

      <Box flexDirection="column" gap={6} padding={12}>
        <Box
          display="flex"
          alignItems="flex-start"
          justifyContent="space-between"
          gap={6}
        >
          <Typography as="h3" variant="h6" fontWeight={700}>
            {marker.title}
          </Typography>
          <Button
            unstyled
            text="×"
            aria-label={labels.close}
            title={labels.close}
            onClick={onClose}
            color="var(--foreground)"
            paddingX={4}
            styles={{ cursor: "pointer", lineHeight: 1 }}
          />
        </Box>

        {marker.speciesName && (
          <Typography
            variant="caption"
            color="var(--foreground-muted, #6b7280)"
          >
            {marker.speciesName}
          </Typography>
        )}

        <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
          {marker.locationName
            ? `${marker.dateLabel} · ${marker.locationName}`
            : marker.dateLabel}
        </Typography>

        {/* The API blurs the pair to ~1 km for *every* caller when the place is
            flagged sensitive, so this says so rather than implying an exact pin. */}
        {marker.approximate && (
          <Typography variant="label" color="var(--foreground-muted, #6b7280)">
            {labels.approximate}
          </Typography>
        )}

        <Link href={marker.href} prefetch className="sm__link">
          <Typography
            as="span"
            variant="label"
            fontWeight={700}
            color="var(--accent, #06b6d4)"
          >
            {labels.seeDetail}
          </Typography>
        </Link>
      </Box>
    </Card>
  );
}

export default SightingsMap;
