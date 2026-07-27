import { getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { SectionHero } from "@/components/section-hero";
import { CategoryCard } from "@/components/catalog-categories";
import { BuyableCard } from "@/components/buyable-card";
import {
  getMenuCategories,
  getAllMenuItems,
  getMenuItemsByKind,
  type MenuItemDetail,
} from "@/lib/catalog";
import {
  MENU_ALL_PATH,
  MENU_ITEM_KINDS,
  type MenuItemKind,
} from "@/lib/menu-kinds";

/**
 * The menu listing, in its two shapes - shared by all six routes so they cannot
 * drift apart.
 *
 * - `kind: null` (`/categories/menu`) is the **whole menu**: the tenant's
 *   `MenuCategory` cards, then one section per kind in `MENU_ITEM_KINDS` order,
 *   the way a printed menu reads.
 * - `kind: "drink"` (and the rest) is **one kind**, every category together -
 *   the structural question the API's `?kind=` filter answers. No category
 *   cards here: a category may hold several kinds, so its card would promise
 *   items this page is not showing.
 *
 * Categories stay free-form tenant copy and `kind` is what code branches on, so
 * a page is never selected by matching a category's name (see the note on
 * `MENU_ITEM_KIND_CHOICES` in `catalog/models.py`).
 */
interface MenuListingProps {
  locale: string;
  /** The single kind to list, or `null` for the whole menu. */
  kind: MenuItemKind | null;
}

export async function MenuListing({ locale, kind }: MenuListingProps) {
  const [categories, items, t, detailT, kindT, menuT, catalogT] =
    await Promise.all([
      kind === null ? getMenuCategories() : Promise.resolve([]),
      kind === null ? getAllMenuItems() : getMenuItemsByKind(kind),
      getTranslations("FoodPage"),
      getTranslations("CategoryDetail"),
      getTranslations("MenuKinds"),
      getTranslations("Menu"),
      getTranslations("CatalogItems"),
    ]);

  const heading = kind === null ? t("heading") : kindT(kind);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: detailT("home"), href: "/" },
    ...(kind === null
      ? [{ label: detailT("food") }]
      : [
          { label: detailT("food"), href: MENU_ALL_PATH },
          { label: kindT(kind) },
        ]),
  ];

  // On the whole-menu page, one section per kind that has something in it - the
  // headings are what make that page worth visiting over a kind page. A kind
  // page is a single section and needs no heading of its own: the page title
  // already says which kind it is.
  const sections: {
    key: string;
    heading: string | null;
    items: MenuItemDetail[];
  }[] =
    kind === null
      ? MENU_ITEM_KINDS.map((k) => ({
          key: k,
          heading: kindT(k),
          items: items.filter((item) => item.kind === k),
        })).filter((section) => section.items.length > 0)
      : items.length > 0
        ? [{ key: kind, heading: null, items }]
        : [];

  const images = [
    ...categories.map((c) => c.image),
    ...items.map((i) => i.image),
  ].filter(Boolean) as string[];
  // Server component: a fresh random hero per request is intentional and carries
  // no hydration concern (rendered once on the server).
  // eslint-disable-next-line react-hooks/purity
  const randomIndex = Math.floor(Math.random() * images.length);
  const heroImage = images.length > 0 ? images[randomIndex] : null;

  // The first rendered block sits directly under the breadcrumbs, whose 8px
  // margin is the only gap that group wants - `catalog-section`'s 48px top
  // padding is for *stacked* sections. The categories grid leads when there is
  // one, so only then do the item sections all keep their padding.
  const hasCategories = categories.length > 0;
  const sectionClassName = (isFirst: boolean) =>
    `catalog-section${isFirst ? " catalog-section--flush-top" : ""}`;

  return (
    <>
      {heroImage && (
        <SectionHero
          backgroundImage={heroImage}
          slogan={heading}
          style={{ height: "clamp(220px, 30vw, 400px)" }}
        />
      )}
      <Container
        paddingX={10}
        marginTop={16}
        paddingTop={!heroImage ? "var(--ui-navbar-height, 57px)" : undefined}
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        {!heroImage && (
          <Typography
            as="h1"
            variant="h1"
            className="section-title"
            marginBottom={24}
          >
            {heading}
          </Typography>
        )}
        {hasCategories && (
          <section className={sectionClassName(true)}>
            <Box
              marginBottom={32}
              display="flex"
              flexDirection="column"
              gap={10}
            >
              <Typography as="h2" variant="h2" className="section-title">
                {t("categoriesHeading")}
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {categories.map((cat) => {
                const name =
                  (locale === "en" ? cat.en_name : cat.name) ??
                  cat.name ??
                  cat.en_name ??
                  "";
                const description =
                  (locale === "en" ? cat.en_description : cat.description) ??
                  cat.description ??
                  cat.en_description ??
                  "";
                return (
                  <Grid key={cat.id} size={{ xs: 6, sm: 4, lg: 3 }}>
                    <CategoryCard
                      id={cat.id}
                      name={name}
                      description={description}
                      image={cat.image}
                      itemCount={cat.item_count}
                      type="food"
                      href={`/categories/food/${cat.slug}/`}
                    />
                  </Grid>
                );
              })}
            </Grid>
          </section>
        )}
        {sections.map((section, index) => (
          <section
            key={section.key}
            className={sectionClassName(!hasCategories && index === 0)}
          >
            {section.heading !== null && (
              <Box
                marginBottom={32}
                display="flex"
                flexDirection="column"
                gap={10}
              >
                <Typography as="h2" variant="h2" className="section-title">
                  {section.heading}
                </Typography>
              </Box>
            )}
            <Grid container spacing={2}>
              {section.items.map((item) => (
                <Grid key={item.id} size={{ xs: 6, sm: 3 }}>
                  <BuyableCard
                    item={{ kind: "food", data: item }}
                    locale={locale}
                    productLabel={catalogT("productLabel")}
                    serviceLabel={catalogT("serviceLabel")}
                    menuLabel={catalogT("menuLabel")}
                    fromLabel={menuT("from")}
                  />
                </Grid>
              ))}
            </Grid>
          </section>
        ))}
        {items.length === 0 && (
          <Typography variant="none" className="section-subtitle">
            {menuT("empty")}
          </Typography>
        )}
      </Container>
    </>
  );
}
