import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { SectionHero } from "@/components/section-hero";
import { getSession } from "@repo/auth/session";
import { getMenuCategory, getMenuItemsByCategory } from "@/lib/catalog";
import { CategoryDetail } from "@/components/category-detail";
import { AdminEditButton } from "@/components/admin-edit-button";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await getMenuCategory(slug);
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

export default async function MenuCategoryPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [category, t, tAdmin, session] = await Promise.all([
    getMenuCategory(slug),
    getTranslations("CategoryDetail"),
    getTranslations("Admin"),
    getSession(),
  ]);

  if (!category) notFound();

  const items = await getMenuItemsByCategory(category.id);

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
    { label: t("food"), href: "/categories/food" },
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
                  href={`/admin/menu-categories/${category.id}`}
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
          kind="food"
          items={items}
          locale={locale}
          showTitle={!hasImage}
        />
      </Container>
    </>
  );
}
