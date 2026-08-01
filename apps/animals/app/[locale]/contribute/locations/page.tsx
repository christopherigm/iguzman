import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { NavbarSpacer, PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import { getContributeCounties, getContributeLocations } from "@/lib/catalog";
import { localized } from "@/lib/i18n-field";
import { SignInPrompt } from "@/components/contribute/sign-in-prompt";
import { LocationContributePanel } from "./location-contribute-panel";

/**
 * "Add a place" - the third public contribute route, and the only one reachable
 * from *inside* another flow.
 *
 * **It takes no query param, and there is nothing for one to say.** The species
 * route needs `?category=` because a species is meaningless outside one, and the
 * sighting route reads `?species=`/`?category=` because its subject is what the
 * FAB was pressed on. A place is the top of its own tree: it belongs to nothing,
 * and the one relation it *may* have - a parent place - is offered as an optional
 * field rather than fixed by the URL.
 *
 * **The same form is embedded in the sighting flow**, under its place field
 * (`SightingContributeForm` → the add button beside the place picker). That is
 * the path that actually matters - a contributor blocked mid-entry by a pond
 * nobody has catalogued - and this route is the standalone way in for someone who
 * simply wants to add a place. Both render
 * `components/contribute/location-contribute-form.tsx`, so the two can never ask
 * different questions.
 *
 * The two lookup lists are read here rather than in the form because their labels
 * are bilingual and have to be resolved per locale on the server, exactly as the
 * sighting page resolves its places.
 */

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  // `setRequestLocale` then the plain form - the `{ locale, namespace }` overload
  // widens the namespace to `never` against this app's typed messages. See the
  // note on the species page.
  setRequestLocale(locale);
  const t = await getTranslations("Contribute");

  return {
    title: t("placeTitle"),
    description: t("placeMetaDescription"),
    // A pending-review form has nothing for a crawler.
    robots: { index: false, follow: false },
  };
}

export default async function ContributeLocationPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Contribute");

  // Independent reads, and both are optional fields on the form - so they start
  // together and a failure of either costs a picker rather than the page.
  const [session, places, counties] = await Promise.all([
    getSession(),
    getContributeLocations(),
    getContributeCounties(),
  ]);

  const breadcrumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: t("placeBreadcrumb") },
  ];

  return (
    <Box flexDirection="column" width="100%">
      <NavbarSpacer />

      <Container size="md" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        <Box flexDirection="column" gap={8} marginTop={24} marginBottom={24}>
          <Typography as="h1" variant="h2" fontWeight={700}>
            {t("placeTitle")}
          </Typography>
          <Typography variant="body" color="var(--foreground-muted, #6b7280)">
            {t("placeIntro")}
          </Typography>
        </Box>

        {session ? (
          <LocationContributePanel
            // A parent option carries its coordinates as well as its label: the
            // map opens over the parent place when no pin has been dropped yet,
            // so a trail starts inside its park.
            parents={places
              .map((place) => ({
                value: String(place.id),
                label: localized(place, "name", locale) ?? place.slug,
                latitude: place.latitude,
                longitude: place.longitude,
              }))
              .sort((a, b) => a.label.localeCompare(b.label, locale))}
            // Each county names its state, which is the only thing that tells the
            // Durango in Mexico from the one in Colorado - the same job the CMS's
            // own county picker does.
            counties={counties
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
              .sort((a, b) => a.label.localeCompare(b.label, locale))}
            doneLabel={t("backToJournal")}
            doneHref="/"
          />
        ) : (
          <SignInPrompt description={t("signInPlace")} />
        )}
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}
