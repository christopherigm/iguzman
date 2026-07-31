import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import type { SightingMapPin } from "@/lib/journal";
import { localized } from "@/lib/i18n-field";
import {
  SightingsMap,
  type SightingMarker,
  type SightingsMapFilter,
} from "./sightings-map";
import "./sightings-map-section.css";

/**
 * A titled band holding the map, and the server half of it.
 *
 * The exact shape `SightingsSection` has for the slider, for the same reason:
 * the map is a client component, so every bilingual pair, every href and every
 * date is resolved **here** - on the server, where the locale lives - and handed
 * down as plain strings. Two routes render this band (the landing and a
 * category), which is the threshold at which `apps/CLAUDE.md` says a
 * route-local component moves into `components/`.
 *
 * Renders nothing when there is nothing to pin, so a caller can hand it whatever
 * the API returned without guarding first.
 */

interface Props {
  pins: SightingMapPin[];
  locale: string;
  title: string;
  subtitle?: string | null;
  /**
   * Which dropdowns to offer. A category page passes its own list without
   * `category` - every pin on it is that category, so the filter could only ever
   * be a no-op. (`SightingsMap` drops a single-valued filter anyway; naming it
   * here is what documents the intent.)
   */
  filters?: SightingsMapFilter[];
  height?: number;
  /**
   * Deepest zoom the initial framing may choose. Left to the map's own default
   * unless the caller knows something about its pins - a single entry's page
   * backs it off for a coordinate the API has already blurred to ~1 km.
   */
  maxFitZoom?: number;
  /**
   * Something to stand **beside** the map from `sm` up, under the same heading,
   * stacked above it below `sm`. It sizes itself - the map simply takes whatever
   * horizontal space is left - so whatever is passed has to carry its own width
   * (`SightingVideos` does, from its `frameHeight`).
   *
   * One caller: a sighting page whose only clip is portrait, where "where it was
   * seen" and a tall thin video are one band rather than two, and the map's
   * height is what the clip is cut to. Everything else leaves it unset and gets
   * the full-width map.
   */
  aside?: ReactNode;
}

export async function SightingsMapSection({
  pins,
  locale,
  title,
  subtitle,
  filters,
  height,
  maxFitZoom,
  aside,
}: Props) {
  const t = await getTranslations("Map");
  const tSighting = await getTranslations("Sighting");
  const tSightingPage = await getTranslations("SightingPage");
  const format = await getFormatter({ locale });

  if (pins.length === 0) return null;

  const markers = pins.map((pin) => toMarker(pin, locale, format));

  const map = (
    <SightingsMap
      markers={markers}
      {...(filters ? { filters } : {})}
      {...(height ? { height } : {})}
      {...(maxFitZoom ? { maxFitZoom } : {})}
      labels={{
        map: t("label"),
        zoomIn: t("zoomIn"),
        zoomOut: t("zoomOut"),
        attribution: t("attribution"),
        close: t("close"),
        all: t("filterAll"),
        category: tSighting("category"),
        species: tSighting("species"),
        location: tSighting("location"),
        year: t("filterYear"),
        empty: t("empty"),
        approximate: tSightingPage("mapApproximate"),
        seeDetail: tSighting("seeDetail"),
        yourLocation: t("yourLocation"),
        locate: t("locate"),
        fullscreen: t("fullscreen"),
        exitFullscreen: t("exitFullscreen"),
        // Both spellings of the modifier travel down; the client knows which
        // keyboard the reader has, this component does not.
        zoomHint: t("zoomHint"),
        zoomHintMac: t("zoomHintMac"),
      }}
    />
  );

  return (
    <Box flexDirection="column" gap={24} width="100%">
      <Box flexDirection="column" gap={8}>
        <Typography as="h2" variant="h2" fontWeight={700}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body" color="var(--foreground-muted, #6b7280)">
            {subtitle}
          </Typography>
        )}
      </Box>

      {/* Below `sm` this is a plain column - the aside stacks above the map, and
          the two read as one band either way. The row, and the aside keeping its
          own width while the map takes the rest, is the media query in
          `sightings-map-section.css`.

          ⚠ Both breakpoints live in the CSS, and none of this is a prop. A prop
          is an *inline style*, which beats a class - `flexDirection="column"`
          here left the row stacked at every width (with the media query's
          `align-items: flex-start` then shrinking the map to nothing, so it
          rendered as a hairline). For the same reason neither child takes a
          `width`. `gap` is still a prop: it is what makes this a flex container
          at all, and it does not change across the breakpoint. */}
      {aside ? (
        <Box className="sms__row" gap={16} width="100%">
          <Box className="sms__aside">{aside}</Box>
          <Box className="sms__map">{map}</Box>
        </Box>
      ) : (
        map
      )}
    </Box>
  );
}

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

function toMarker(
  pin: SightingMapPin,
  locale: string,
  format: Formatter,
): SightingMarker {
  const speciesName = localized(
    { name: pin.species_name, en_name: pin.species_en_name },
    "name",
    locale,
  );

  return {
    id: pin.id,
    // Built here rather than in the map: the locale prefix is part of every
    // internal path in this app, and the server component is where it lives.
    href: `/sightings/${pin.slug}`,
    // `name` is the entry's optional title; the species name is the documented
    // fallback when the author left it blank.
    title: localized(pin, "name", locale) ?? speciesName ?? pin.slug,
    speciesName,
    categoryName: localized(
      { name: pin.category_name, en_name: pin.category_en_name },
      "name",
      locale,
    ),
    locationName: localized(
      { name: pin.location_name, en_name: pin.location_en_name },
      "name",
      locale,
    ),
    dateLabel: formatSightingDate(pin.date, format),
    // Sliced off the raw `YYYY-MM-DD` rather than read off a parsed Date: the
    // filter groups by the day the entry records, which must not shift under a
    // visitor's timezone.
    year: pin.date.slice(0, 4),
    // The species' glyph is the point of the marker; its category's is the
    // fallback, so a species with no icon of its own still reads as its branch.
    icon: pin.species_icon ?? pin.category_icon,
    color: pin.category_color,
    image: pin.image,
    latitude: pin.latitude,
    longitude: pin.longitude,
    approximate: pin.coordinates_are_approximate,
  };
}

/**
 * The API publishes a bare calendar day (`YYYY-MM-DD`). Parsed as-is that is UTC
 * midnight, which renders as the *previous* day for any visitor west of
 * Greenwich - so it is anchored at local noon, which no timezone can push across
 * a date boundary.
 */
function formatSightingDate(date: string, format: Formatter): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return format.dateTime(parsed, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
