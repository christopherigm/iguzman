import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { NavbarSpacer, PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import { getCategory, kindHref } from "@/lib/catalog";
import { localized } from "@/lib/i18n-field";
import { SignInPrompt } from "@/components/contribute/sign-in-prompt";
import { SpeciesContributeForm } from "./species-contribute-form";

/**
 * "Add a species" - the public, staged counterpart to the CMS's species form,
 * reached from the FAB on `/[locale]/categories/[slug]`.
 *
 * **The category is a query param and it is required.** A species is meaningless
 * outside one (its `kind` - the whole branch it appears under - is read through the
 * category), and the flow is entered from a category's own page, so the branch is
 * already decided. Asking a contributor to re-pick it would be asking them to
 * re-answer a question the page they just left had already answered - and to get it
 * wrong. A missing or unknown slug is a 404 rather than a picker: there is no
 * meaningful "add a species to nowhere".
 *
 * The whole form is one client component. The stages share a draft, and a stage
 * boundary is not a navigation - a reader who reached stage 3 and stepped back must
 * find stage 1 as they left it, which a route per stage would not give without
 * putting the draft somewhere it can be lost.
 */

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string }>;
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
    title: t("speciesTitle"),
    // Not `speciesIntro`: that one names the category, which `generateMetadata`
    // deliberately does not fetch - a robots-noindex page is not worth a request.
    description: t("speciesMetaDescription"),
    // A pending-review form has nothing for a crawler, and every URL under it is
    // per-contributor by definition.
    robots: { index: false, follow: false },
  };
}

export default async function ContributeSpeciesPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { category: categorySlug } = await searchParams;
  if (!categorySlug) notFound();

  const t = await getTranslations("Contribute");
  const tKinds = await getTranslations("Kinds");

  // The session and the category are independent, so both start together - a
  // signed-out reader still gets the category's name in the prompt's heading.
  const [session, category] = await Promise.all([
    getSession(),
    getCategory(categorySlug),
  ]);

  // `getCategory` answers null only on a real 404 (see lib/catalog.ts), so this
  // cannot turn a backend outage into "no such category".
  if (!category) notFound();

  const categoryName = localized(category, "name", locale) ?? category.slug;
  const categoryHref = `/categories/${category.slug}`;

  const breadcrumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: tKinds(category.kind), href: kindHref(category.kind) },
    { label: categoryName, href: categoryHref },
    { label: t("speciesBreadcrumb") },
  ];

  return (
    <Box flexDirection="column" width="100%">
      <NavbarSpacer />

      <Container size="md" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        <Box flexDirection="column" gap={8} marginTop={24} marginBottom={24}>
          <Typography as="h1" variant="h2" fontWeight={700}>
            {t("speciesTitle")}
          </Typography>
          <Typography variant="body" color="var(--foreground-muted, #6b7280)">
            {t("speciesIntro", { category: categoryName })}
          </Typography>
        </Box>

        {/* The form translates itself through `NextIntlClientProvider` (as the
            CMS's `AdminForm` does) - only the *category*, which is bilingual data
            resolved per locale, is passed down. */}
        {session ? (
          <SpeciesContributeForm
            categoryId={category.id}
            categoryName={categoryName}
            categoryHref={categoryHref}
          />
        ) : (
          <SignInPrompt
            description={t("signInSpecies", { category: categoryName })}
          />
        )}
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}
