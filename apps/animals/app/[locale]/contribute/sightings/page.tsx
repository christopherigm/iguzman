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
} from "@/lib/catalog";
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
            // The credit line starts as the account's own name - the common case
            // by far - and stays editable, because an author may be filing a
            // friend's photograph.
            defaultAuthorName={session.displayName}
            // Sorted here rather than in the fetcher: the label is the
            // *localized* name, so the order only exists once the locale has
            // picked which half of each pair is shown.
            locations={locations
              .map((place) => ({
                value: String(place.id),
                label: localized(place, "name", locale) ?? place.slug,
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
