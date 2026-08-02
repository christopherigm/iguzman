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
  getAllSpecies,
  getCategory,
  getContributeCounties,
  getContributeLocations,
  getSpecies,
  getWeatherConditions,
  kindHref,
  type ContributeLocation,
  type Kind,
} from "@/lib/catalog";
import { DEFAULT_MAX_VIDEO_SECONDS } from "@/lib/contribute";
import { placeLabel } from "@/lib/place-types";
import { localized } from "@/lib/i18n-field";
import { SignInPrompt } from "@/components/contribute/sign-in-prompt";
import { SightingContributeForm } from "./sighting-contribute-form";
import type { SpeciesChoice, SpeciesSubject } from "./species-picker";

/**
 * "Add a sighting" - the public, staged counterpart to the CMS's sighting form,
 * reached from the FAB on `/[locale]/species/[slug]`, `/[locale]/sightings/[slug]`
 * and `/[locale]/categories/[slug]`.
 *
 * **How much of the subject the URL knows is what this page branches on**, and
 * each of the three FABs knows a different amount:
 *
 * | Entered from  | Param                | The flow then asks for      |
 * | ------------- | -------------------- | --------------------------- |
 * | a species     | `?species=<slug>`    | nothing - it is decided     |
 * | a sighting    | `?species=<slug>`    | nothing - it is decided     |
 * | a category    | `?category=<slug>`   | which species, of that one  |
 * | nowhere       | none                 | branch, category, species   |
 *
 * `?species=` is still the preferred way in and is still exact: the FAB was
 * pressed on a page that names the animal, so re-asking would only be inviting a
 * wrong answer, and an unknown slug is a **404** rather than a silent fallback to
 * the picker. `?category=` is a *hint* instead - it prefills the picker's first
 * two steps and nothing more - so an unknown one costs the prefill, not the page.
 * With neither, the picker starts from the branch. See `SpeciesPicker`.
 *
 * The whole species list is only fetched in the two cases that actually open a
 * picker; arriving with `?species=` reads one record, as it always did.
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
  searchParams: Promise<{ species?: string; category?: string }>;
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

  const { species: speciesSlug, category: categorySlug } = await searchParams;

  const t = await getTranslations("Contribute");
  const tKinds = await getTranslations("Kinds");
  const tPlaceTypes = await getTranslations("PlaceTypes");

  /**
   * Who is asking, resolved **before** anything is fetched.
   *
   * ⚠ It is not one of the reads below, and putting it back among them would
   * undo the guard underneath. `getSession()` is a cookie read and a JWT decode
   * with no I/O behind it, so awaiting it on its own costs nothing measurable -
   * and it is what lets the three option lists be skipped outright for a reader
   * who is not signed in. That is not a rare path: the FAB is deliberately shown
   * to everybody (it is how a reader learns the site takes contributions at all),
   * so a signed-out press is expected, and this page answered it by fetching the
   * whole catalog to render a sign-in prompt that reads none of it.
   */
  const session = await getSession();

  /**
   * The counties, for the place form stage 1 can open under its picker - and the
   * one read on this page that is **started but never awaited**.
   *
   * ⚠ It is the most expensive list in the app and the least often looked at:
   * `seed_geography` alone puts 244 rows in it, the API answers with the full
   * location-grade payload for each, and locally that is ~97 KB and ~375 ms -
   * more than the other three reads put together, and about twice what the whole
   * rest of this page costs. Every contributor used to wait for it; almost none
   * of them press "add a place", which is the only control that reads it.
   *
   * So it stays a promise. React streams it to the client and
   * `LocationContributeForm` unwraps it with `use()` when the panel is actually
   * opened - by which time it has long since resolved, so nothing suspends. The
   * mapping still happens **here**, on the server, because a county's label is
   * bilingual and `localized()` needs the request locale; only the *waiting*
   * moved. Do not put it back in the `Promise.all` below.
   *
   * It also takes this page from four simultaneous requests to three, which
   * matters in production: animals-api runs three **sync** gunicorn workers, so
   * the fourth was queueing behind its own siblings.
   */
  const countiesPromise = (
    session ? getContributeCounties() : Promise.resolve([])
  ).then((counties) =>
    counties
      .map((county) => {
        const name = localized(county, "name", locale) ?? county.slug;
        const state = localized(
          { name: county.state_name, en_name: county.state_en_name },
          "name",
          locale,
        );
        return {
          value: String(county.id),
          label: state ? `${name} — ${state}` : name,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, locale)),
  );

  // Every read is independent, so they all start together rather than in
  // sequence. Two things decide which of them is a real request.
  //
  // What the URL named picks between the two subject reads: with a species slug
  // there is nothing to pick, so neither the category hint nor the whole species
  // table is worth asking for. Those two are read for **either** reader - the
  // heading, the crumbs and the sign-in prompt all name the species, and an
  // unknown `?species=` has to 404 whether or not anyone is signed in.
  //
  // Whether there is a session picks the three option lists, which exist for the
  // form and are read by nothing else on the page.
  const [species, hintCategory, allSpecies, locations, weather] =
    await Promise.all([
      speciesSlug ? getSpecies(speciesSlug) : Promise.resolve(null),
      !speciesSlug && categorySlug
        ? getCategory(categorySlug)
        : Promise.resolve(null),
      session && !speciesSlug ? getAllSpecies() : Promise.resolve([]),
      session ? getContributeLocations() : Promise.resolve([]),
      session ? getWeatherConditions() : Promise.resolve([]),
    ]);

  // Null only on a real 404 - see lib/catalog.ts on why that is trustworthy.
  // Only `?species=` is a promise the page has to keep: it is the whole subject
  // of the entry. An unknown `?category=` is a hint that did not resolve, and
  // costs the picker's prefill rather than the page.
  if (speciesSlug && !species) notFound();

  const speciesName = species
    ? (localized(species, "name", locale) ?? species.slug)
    : null;
  const speciesHref = species ? `/species/${species.slug}` : null;
  const categoryName = localized(
    species
      ? { name: species.category_name, en_name: species.category_en_name }
      : hintCategory,
    "name",
    locale,
  );

  /**
   * Every species the picker can offer, projected down to what it filters and
   * labels by - so the API's galleries and descriptions never cross the wire for
   * a dropdown. Both bilingual pairs are resolved here, on the server, exactly as
   * `placeLabel` resolves a place's.
   *
   * Sorted **by category then by name**, which is the order both lower steps of
   * the cascade read out of it: the category select takes the first appearance of
   * each category, and a category's species arrive already alphabetized.
   *
   * A species whose category is missing is dropped - the cascade has no step to
   * put it under, and the API only publishes such a row to an administrator.
   */
  const speciesOptions: SpeciesChoice[] = allSpecies
    .flatMap((item) => {
      if (!item.kind || !item.category_slug) return [];
      return [
        {
          id: item.id,
          slug: item.slug,
          name: localized(item, "name", locale) ?? item.slug,
          kind: item.kind,
          categorySlug: item.category_slug,
          categoryName:
            localized(
              { name: item.category_name, en_name: item.category_en_name },
              "name",
              locale,
            ) ?? item.category_slug,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.categoryName.localeCompare(b.categoryName, locale) ||
        a.name.localeCompare(b.name, locale),
    );

  /**
   * The species as the form's fixed subject, when the URL named one. `null` is
   * what switches the flow's first stage over to the picker.
   */
  const fixedSpecies: SpeciesSubject | null = species
    ? { id: species.id, slug: species.slug, name: speciesName ?? species.slug }
    : null;

  /**
   * How one place reads in the picker: `Lake Estes (Lake) - Larimer`.
   *
   * ⚠ **Shared with the form** (`lib/place-types.ts`) rather than written here,
   * because the form has to build one more label in the browser - for a place a
   * contributor adds from inside stage 1 - and two copies of the rule would mean
   * the place they just created reading differently from every other option in
   * the same list. The `PlaceTypes` translator is passed in because the payload's
   * own `place_type_display` is English-only.
   */
  const label = (place: ContributeLocation): string =>
    placeLabel(place, locale, tPlaceTypes);

  /**
   * The trail down to whatever the URL actually knew: the species' own branch and
   * category when it named a species, the hint category's when it named one of
   * those, and nothing but Home when it named neither.
   *
   * Both sources are read through the same two locals, which is why they are
   * resolved above rather than off `species` inline - the crumbs do not care
   * which of the two answered.
   */
  const branchKind: Kind | null = species
    ? species.kind
    : (hintCategory?.kind ?? null);
  const crumbCategorySlug = species
    ? species.category_slug
    : (hintCategory?.slug ?? null);

  const breadcrumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    ...(branchKind
      ? [{ label: tKinds(branchKind), href: kindHref(branchKind) }]
      : []),
    ...(categoryName && crumbCategorySlug
      ? [
          {
            label: categoryName,
            href: `/categories/${crumbCategorySlug}`,
          },
        ]
      : []),
    ...(speciesName && speciesHref
      ? [{ label: speciesName, href: speciesHref }]
      : []),
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
            {/* Named when the URL named it. The `?category=` case deliberately
                does *not* get its own "for this category" line: the category is
                only where the picker opens, and the contributor is free to move
                off it, so promising one here would be a promise the form does
                not keep. */}
            {speciesName
              ? t("sightingIntro", { species: speciesName })
              : t("sightingIntroAny")}
          </Typography>
        </Box>

        {session ? (
          <SightingContributeForm
            species={fixedSpecies}
            speciesOptions={speciesOptions}
            initialKind={branchKind}
            initialCategorySlug={crumbCategorySlug}
            // Display only - the API derives the published credit from this same
            // account, so nothing here is submitted. `firstName`, not
            // `displayName`: the latter is the navbar's 10-char label and falls
            // back to the email, so it would promise a credit that the API,
            // which publishes the first name or nothing, would not print.
            creditName={session.firstName}
            // Read here, in a server component, so a Helm change moves it
            // without a rebuild - `NEXT_PUBLIC_` would inline it at image build
            // time instead. `Number('')` is 0 and `Number(undefined)` is NaN,
            // and both are falsy, so an unset or malformed value falls back to
            // the API's own default rather than to a cap of zero seconds.
            maxVideoSeconds={
              Number(process.env.MAX_CONTRIBUTION_VIDEO_SECONDS) ||
              DEFAULT_MAX_VIDEO_SECONDS
            }
            // Sorted here rather than in the fetcher: the label is *localized*,
            // so the order only exists once the locale has picked which half of
            // each pair is shown. It leads with the name, so this is still a
            // by-name sort - the kind and county only break ties.
            locations={locations
              .map((place) => ({
                value: String(place.id),
                label: label(place),
              }))
              .sort((a, b) => a.label.localeCompare(b.label, locale))}
            weather={weather.map((condition) => ({
              value: String(condition.id),
              label: localized(condition, "name", locale) ?? condition.slug,
            }))}
            // A promise, not an array - see `countiesPromise` above. It is
            // forwarded untouched to the place form, which is the only thing
            // that reads it and only once it has been opened.
            counties={countiesPromise}
            // The same places again, labelled by their bare name and carrying
            // their coordinates: this list is the place form's *parent* picker,
            // where the kind-and-county label the sighting's own picker needs
            // would be noise, and where the coordinates decide what the map
            // opens over.
            parentPlaces={locations
              .map((place) => ({
                value: String(place.id),
                label: localized(place, "name", locale) ?? place.slug,
                latitude: place.latitude,
                longitude: place.longitude,
              }))
              .sort((a, b) => a.label.localeCompare(b.label, locale))}
          />
        ) : (
          <SignInPrompt
            description={
              speciesName
                ? t("signInSighting", { species: speciesName })
                : t("signInSightingAny")
            }
          />
        )}
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}
