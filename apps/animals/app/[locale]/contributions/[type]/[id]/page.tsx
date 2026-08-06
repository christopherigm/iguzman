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
  getContributeCounties,
  getContributeLocations,
  getWeatherConditions,
  type ContributeLocation,
} from "@/lib/catalog";
import { DEFAULT_MAX_VIDEO_SECONDS } from "@/lib/contribute";
import { isContributionType } from "@/lib/contributions";
import { localized } from "@/lib/i18n-field";
import { placeLabel } from "@/lib/place-types";
import { SignInPrompt } from "@/components/contribute/sign-in-prompt";
import { ContributionEditor } from "./contribution-editor";
import type { SpeciesChoice } from "../../../contribute/sightings/species-picker";

/**
 * One of the caller's own contributions: the record as they filed it, in the
 * form they filed it with, plus the two things the filing flow has no use for -
 * where it stands, and how to withdraw it.
 *
 * **The record itself is not fetched here**, and that is the one thing worth
 * knowing about this page. It is per-account and needs a bearer token, and
 * `apiFetch` refreshes that token by writing a cookie - which a server component
 * may not do. So the read happens in `ContributionEditor` through the
 * `/api/contributions` route handler, exactly as the CMS's own forms read
 * (`lib/admin-api.ts`), and a 404 from it is what stands in for `notFound()` on
 * a record that is not this caller's.
 *
 * What this page *does* fetch is the same thing the contribute pages fetch: the
 * **option lists** the three forms need (species, places, weather, counties).
 * Those are public, bilingual and have to be resolved per locale on the server -
 * so they are read here for the same reason and, deliberately, in the same
 * shapes, since the forms they are handed to are the same components.
 *
 * ⚠ **All four reads are gated on the session**, as on the contribute pages: a
 * signed-out visitor gets the prompt, and fetching the whole species table to
 * render it would be four API requests for a page with no form on it.
 *
 * ⚠ **The counties list is started and never awaited**, again as there. It is
 * the app's most expensive read and it feeds one optional field on a form most
 * contributors will not open; `CountyField` unwraps it with `use()` when it is
 * actually on screen. Do not fold it into the `Promise.all`.
 */

type Props = {
  params: Promise<{ locale: string; type: string; id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Contributions");

  return {
    title: t("editTitle"),
    // Per-contributor, and behind a session - there is nothing here to index.
    robots: { index: false, follow: false },
  };
}

export default async function ContributionDetailPage({ params }: Props) {
  const { locale, type, id } = await params;
  setRequestLocale(locale);

  // A URL that names no real type, or a non-numeric id, is a 404 before
  // anything is read - the router matched a string, the API takes an int.
  if (!isContributionType(type) || !/^\d+$/.test(id)) notFound();

  const t = await getTranslations("Contributions");
  const tPlaceTypes = await getTranslations("PlaceTypes");
  const session = await getSession();

  const breadcrumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: t("breadcrumb"), href: "/contributions" },
    { label: t(`kind_${type}`) },
  ];

  if (!session) {
    return (
      <Shell breadcrumbs={breadcrumbs} title={t("editTitle")}>
        <SignInPrompt description={t("signIn")} />
      </Shell>
    );
  }

  // See the docstring: started, never awaited, and forwarded as a promise.
  const countiesPromise = getContributeCounties().then((counties) =>
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

  // Only what the form for *this* type actually reads. A place's form has no
  // species picker and a species proposal has no place field, so asking for
  // either would be three requests spent on a form that never shows them.
  const needsSightingLists = type === "sightings";
  const needsPlaceLists = type === "sightings" || type === "locations";

  const [allSpecies, locations, weather] = await Promise.all([
    needsSightingLists ? getAllSpecies() : Promise.resolve([]),
    needsPlaceLists ? getContributeLocations() : Promise.resolve([]),
    needsSightingLists ? getWeatherConditions() : Promise.resolve([]),
  ]);

  // The same projection the contribute page makes, and for the same reason: the
  // picker filters and labels by these five fields, so the API's galleries and
  // descriptions never cross the wire for a dropdown.
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

  const label = (place: ContributeLocation): string =>
    placeLabel(place, locale, tPlaceTypes);

  return (
    <Shell breadcrumbs={breadcrumbs} title={t("editTitle")}>
      <ContributionEditor
        type={type}
        id={Number(id)}
        locale={locale}
        speciesOptions={speciesOptions}
        creditName={session.firstName}
        maxVideoSeconds={
          Number(process.env.MAX_CONTRIBUTION_VIDEO_SECONDS) ||
          DEFAULT_MAX_VIDEO_SECONDS
        }
        locations={locations
          .map((place) => ({ value: String(place.id), label: label(place) }))
          .sort((a, b) => a.label.localeCompare(b.label, locale))}
        weather={weather.map((condition) => ({
          value: String(condition.id),
          label: localized(condition, "name", locale) ?? condition.slug,
        }))}
        counties={countiesPromise}
        parentPlaces={locations
          .map((place) => ({
            value: String(place.id),
            label: localized(place, "name", locale) ?? place.slug,
            latitude: place.latitude,
            longitude: place.longitude,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, locale))}
      />
    </Shell>
  );
}

/** The page chrome both branches above render into. */
function Shell({
  breadcrumbs,
  title,
  children,
}: {
  breadcrumbs: { label: string; href?: string }[];
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box flexDirection="column" width="100%">
      <NavbarSpacer />

      <Container size="md" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        <Box flexDirection="column" gap={8} marginTop={24} marginBottom={24}>
          <Typography as="h1" variant="h2" fontWeight={700}>
            {title}
          </Typography>
        </Box>

        {children}
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}
