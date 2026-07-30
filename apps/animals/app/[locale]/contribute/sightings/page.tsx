import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { NavbarSpacer, PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import {
  getContributeLocations,
  getSpecies,
  getWeatherConditions,
  kindHref,
  type ContributeLocation,
} from "@/lib/catalog";
import { isPlaceType } from "@/lib/place-types";
import { localized } from "@/lib/i18n-field";
import { SignInPrompt } from "@/components/contribute/sign-in-prompt";
import { SightingContributeForm } from "./sighting-contribute-form";

/**
 * "Add a sighting" - the public, staged counterpart to the CMS's sighting form,
 * reached from the FAB on `/[locale]/sightings/[slug]`.
 *
 * **The species is a query param and it is required**, for the same reason the
 * category is on the species flow: an entry records *something*, the FAB was
 * pressed on a page that already names it, and a species picker over the whole
 * catalog is both a long dropdown and a chance to file the entry against the wrong
 * animal. A missing or unknown slug is a 404 rather than a picker.
 *
 * The two lookup lists (places, weather) are fetched here rather than in the form:
 * they are bilingual data, so their labels have to be resolved per locale on the
 * server, exactly as `SightingsSection` resolves a card's.
 *
 * **A contributor picks a place; they do not drop a pin.** The API takes either
 * (and refuses an entry with neither), but an entry with no coordinates of its own
 * inherits its place's centre - which is the documented normal case for this model,
 * and enough to put the sighting on every map the site draws. The exact spot is an
 * authoring refinement, and `MapPicker` is a CMS form control rather than something
 * to put in front of a reader filing their first entry from a phone.
 */

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ species?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  // `setRequestLocale` then the plain form, rather than
  // `getTranslations({ locale, namespace })` - that overload widens the namespace
  // to `never` against this app's typed messages (see the casts in `layout.tsx`),
  // and a cast here would only be hiding the same thing.
  setRequestLocale(locale);
  const t = await getTranslations("Contribute");

  return {
    title: t("sightingTitle"),
    // Not `sightingIntro` - see the species page's note.
    description: t("sightingMetaDescription"),
    // Nothing here is for a crawler, and every URL under it is per-contributor.
    robots: { index: false, follow: false },
  };
}

export default async function ContributeSightingPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { species: speciesSlug } = await searchParams;
  if (!speciesSlug) notFound();

  const t = await getTranslations("Contribute");
  const tKinds = await getTranslations("Kinds");
  const tPlaceTypes = await getTranslations("PlaceTypes");

  // Four independent reads, so they start together rather than in sequence.
  const [session, species, locations, weather] = await Promise.all([
    getSession(),
    getSpecies(speciesSlug),
    getContributeLocations(),
    getWeatherConditions(),
  ]);

  // Null only on a real 404 - see lib/catalog.ts on why that is trustworthy.
  if (!species) notFound();

  const speciesName = localized(species, "name", locale) ?? species.slug;
  const speciesHref = `/species/${species.slug}`;
  const categoryName = localized(
    { name: species.category_name, en_name: species.category_en_name },
    "name",
    locale,
  );

  /**
   * How one place reads in the picker: `Lake Estes (Lake) - Larimer`.
   *
   * The picker is a search field rather than a dropdown, so an option's label is
   * also the **haystack** it is matched against - a contributor who remembers the
   * county but not the name of the pond types "Larimer" and finds it. It is what
   * tells two places of the same name apart, too (this catalog has an "El Salto"
   * waterfall and an "El Salto" village), the same job the CMS's county picker
   * does by naming each option's state.
   *
   * Both extras are dropped when the place has neither, so a location filed
   * before the geography catalog existed still reads as its bare name. The kind is
   * translated rather than taken from the payload's `place_type_display`, which
   * is English-only.
   */
  const placeLabel = (place: ContributeLocation): string => {
    const name = localized(place, "name", locale) ?? place.slug;
    const kind = isPlaceType(place.place_type)
      ? tPlaceTypes(place.place_type)
      : null;
    const county = localized(
      { name: place.county_name, en_name: place.county_en_name },
      "name",
      locale,
    );

    return [kind ? `${name} (${kind})` : name, county]
      .filter(Boolean)
      .join(" - ");
  };

  const breadcrumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    ...(species.kind
      ? [{ label: tKinds(species.kind), href: kindHref(species.kind) }]
      : []),
    ...(categoryName && species.category_slug
      ? [
          {
            label: categoryName,
            href: `/categories/${species.category_slug}`,
          },
        ]
      : []),
    { label: speciesName, href: speciesHref },
    { label: t("sightingBreadcrumb") },
  ];

  return (
    <Box flexDirection="column" width="100%">
      <NavbarSpacer />

      <Container size="md" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        <Box flexDirection="column" gap={8} marginTop={24} marginBottom={24}>
          <Typography as="h1" variant="h2" fontWeight={700}>
            {t("sightingTitle")}
          </Typography>
          <Typography variant="body" color="var(--foreground-muted, #6b7280)">
            {t("sightingIntro", { species: speciesName })}
          </Typography>
        </Box>

        {session ? (
          <SightingContributeForm
            speciesId={species.id}
            speciesName={speciesName}
            speciesHref={speciesHref}
            // Display only - the API derives the published credit from this same
            // account, so nothing here is submitted. `firstName`, not
            // `displayName`: the latter is the navbar's 10-char label and falls
            // back to the email, so it would promise a credit that the API,
            // which publishes the first name or nothing, would not print.
            creditName={session.firstName}
            // Sorted here rather than in the fetcher: the label is *localized*,
            // so the order only exists once the locale has picked which half of
            // each pair is shown. It leads with the name, so this is still a
            // by-name sort - the kind and county only break ties.
            locations={locations
              .map((place) => ({
                value: String(place.id),
                label: placeLabel(place),
              }))
              .sort((a, b) => a.label.localeCompare(b.label, locale))}
            weather={weather.map((condition) => ({
              value: String(condition.id),
              label: localized(condition, "name", locale) ?? condition.slug,
            }))}
          />
        ) : (
          <SignInPrompt
            description={t("signInSighting", { species: speciesName })}
          />
        )}
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}
