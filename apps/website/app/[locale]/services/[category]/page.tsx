import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { SectionHero } from "@/components/section-hero";
import { getSession } from "@repo/auth/session";
import { getServiceCategory, getServicesByCategory } from "@/lib/catalog";
import { redirectToItemOrNotFound } from "@/lib/catalog-permalink";
import { CategoryDetail } from "@/components/category-detail";
import { kindLabel } from "@/lib/kind-labels";
import { getKindLabels } from "@/lib/system";
import { AdminEditButton } from "@/components/admin-edit-button";
import { CATALOG_ROOT } from "@/lib/catalog-paths";

/**
 * One service category, at `/services/<category>` - the section a customer clicks
 * into from the services listing page.
 *
 * ⚠ It is also this family's **item permalink**: a slug that is not a category
 * is looked up as a service and permanently redirected to
 * `/services/<category>/<slug>`. That is what keeps every `/services/<slug>` link
 * from before the categories existed working. See `lib/catalog-permalink.ts`
 * for what the fallback costs (a category slug wins over a service sharing it).
 */

type Props = {
  params: Promise<{ locale: string; category: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}): Promise<Metadata> {
  const { locale, category: slug } = await params;
  const category = await getServiceCategory(slug);
  // Not a category: the page redirects to an item, which carries its own.
  if (!category) return {};

  const name =
    (locale === "en" ? category.en_name : category.name) ??
    category.name ??
    category.en_name ??
    slug;

  const description =
    (locale === "en" ? category.en_description : category.description) ??
    category.description ??
    category.en_description ??
    undefined;

  return {
    title: name,
    description: description ?? undefined,
    openGraph: {
      title: name,
      description: description ?? undefined,
      images: category.image ? [{ url: category.image }] : undefined,
    },
  };
}

export default async function ServiceCategoryPage({ params }: Props) {
  const { locale, category: slug } = await params;
  setRequestLocale(locale);

  const [category, t, tAdmin, session, labels] = await Promise.all([
    getServiceCategory(slug),
    getTranslations("CategoryDetail"),
    getTranslations("Admin"),
    getSession(),
    getKindLabels(locale),
  ]);

  // Not a category, so try the slug as a service and send the visitor to its
  // canonical URL; 404 only when it is neither.
  if (!category)
    return redirectToItemOrNotFound({ family: "service", slug, locale });

  const items = await getServicesByCategory(category.id);

  const name =
    (locale === "en" ? category.en_name : category.name) ??
    category.name ??
    category.en_name ??
    slug;

  const description =
    (locale === "en" ? category.en_description : category.description) ??
    category.description ??
    category.en_description ??
    "";

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    {
      label: kindLabel(labels, "service", t("services")),
      href: CATALOG_ROOT.service,
    },
    { label: name },
  ];

  const hasImage = Boolean(category.image);

  return (
    <>
      {hasImage && (
        <Box styles={{ position: "relative" }}>
          <SectionHero
            backgroundImage={category.image}
            slogan={name}
            style={{ height: "clamp(220px, 30vw, 400px)" }}
          />
          {/* Admin-only edit shortcut, anchored to the bottom of the hero -
              same slot the item hero uses for its fullscreen control. */}
          {session?.isAdmin && (
            <Container
              size="lg"
              paddingX={10}
              paddingBottom={8}
              styles={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10,
              }}
            >
              <Box justifyContent="flex-end">
                <AdminEditButton
                  href={`/admin/service-categories/${category.id}`}
                  label={tAdmin("edit")}
                  solid
                />
              </Box>
            </Container>
          )}
        </Box>
      )}
      <Container
        paddingX={10}
        marginTop={16}
        paddingTop={!hasImage ? "var(--ui-navbar-height, 57px)" : undefined}
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        {description && (
          <Typography variant="none" className="section-subtitle">
            {description}
          </Typography>
        )}
        <CategoryDetail
          category={category}
          kind="service"
          items={items}
          locale={locale}
          showTitle={!hasImage}
        />
      </Container>
    </>
  );
}
