import { getFormatter, getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import type { Sighting } from "@/lib/journal";
import { localized } from "@/lib/i18n-field";
import { LatestSightings, type SightingSlide } from "./latest-sightings";

/**
 * A titled band of journal entries, wrapping the `LatestSightings` slider.
 *
 * The slider is a client component, so every bilingual pair and every date is
 * resolved here - on the server, where the locale lives - and handed down as
 * plain strings. That mapping used to live in the landing page; three routes now
 * render this band (the landing, a category, a species), which is the threshold
 * at which `apps/CLAUDE.md` says a route-local component moves to `components/`.
 *
 * Renders nothing for an empty feed, so a caller can hand it whatever the API
 * returned without guarding first.
 */

interface Props {
  sightings: Sighting[];
  locale: string;
  title: string;
  subtitle?: string | null;
}

export async function SightingsSection({
  sightings,
  locale,
  title,
  subtitle,
}: Props) {
  const tGallery = await getTranslations("Gallery");
  const tSighting = await getTranslations("Sighting");
  const format = await getFormatter({ locale });

  if (sightings.length === 0) return null;

  const slides = sightings.map((sighting) =>
    // `tSighting` as well as the formatter: the byline is an interpolated string,
    // and the slider is a client component that holds no translator of its own.
    toSightingSlide(sighting, locale, format, tSighting),
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

      <LatestSightings
        slides={slides}
        labels={{
          previous: tGallery("previous"),
          next: tGallery("next"),
          pagination: tGallery("pagination"),
          species: tSighting("species"),
          date: tSighting("date"),
          location: tSighting("location"),
          season: tSighting("season"),
          weather: tSighting("weather"),
          temperature: tSighting("temperature"),
          individuals: tSighting("individuals"),
          seeDetail: tSighting("seeDetail"),
        }}
      />
    </Box>
  );
}

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translator = Awaited<ReturnType<typeof getTranslations>>;

function toSightingSlide(
  sighting: Sighting,
  locale: string,
  format: Formatter,
  tSighting: Translator,
): SightingSlide {
  const speciesName = localized(
    { name: sighting.species_name, en_name: sighting.species_en_name },
    "name",
    locale,
  );

  return {
    id: sighting.id,
    // `name` is the entry's optional title ("First fawn of the spring"); the
    // species name is the documented fallback when the author left it blank.
    title: localized(sighting, "name", locale) ?? speciesName ?? sighting.slug,
    // Both links are built here rather than in the slider: the locale prefix is
    // part of every internal path in this app, and the server component is where
    // the locale lives.
    href: `/sightings/${sighting.slug}`,
    speciesName,
    categoryName: localized(
      { name: sighting.category_name, en_name: sighting.category_en_name },
      "name",
      locale,
    ),
    categoryHref: sighting.category_slug
      ? `/categories/${sighting.category_slug}`
      : null,
    shortDescription: localized(sighting, "short_description", locale),
    dateLabel: formatSightingDate(sighting.date, format),
    locationName: localized(
      { name: sighting.location_name, en_name: sighting.location_en_name },
      "name",
      locale,
    ),
    seasonName: localized(
      { name: sighting.season_name, en_name: sighting.season_en_name },
      "name",
      locale,
    ),
    weatherName: localized(
      { name: sighting.weather_name, en_name: sighting.weather_en_name },
      "name",
      locale,
    ),
    temperature: formatTemperature(sighting.temperature_c, format),
    individuals: sighting.individuals,
    image: sighting.image ?? sighting.species_image,
    // Empty for a CMS entry (nobody filed it), for a contribution filed
    // anonymously, and for an account with no first name - the API publishes
    // nothing in all three cases, so this is one check rather than three (see
    // `Sighting.author_name` in lib/journal.ts).
    authorByline: sighting.author_name
      ? tSighting("recordedBy", { name: sighting.author_name })
      : null,
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

function formatTemperature(
  value: string | null,
  format: Formatter,
): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return `${format.number(parsed, { maximumFractionDigits: 1 })} °C`;
}
