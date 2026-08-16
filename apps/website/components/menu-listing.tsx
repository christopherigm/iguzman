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
import { MenuCategoryNav } from "@/components/menu-category-nav";
import { ScrollToSectionLink } from "@/components/scroll-to-section-link";
import {
  getMenuCategories,
  getAllMenuItems,
  type MenuItemDetail,
} from "@/lib/catalog";
import { getSystem } from "@/lib/system";
import { menuCategoryHref } from "@/lib/menu-paths";

/**
 * The whole menu: the tenant's `MenuCategory` cards, then one section of items
 * per category, in the categories' own `sort_order` - the way a printed menu
 * reads, and the order the operator arranged in the CMS.
 *
 * The category is the *only* sectioning a menu has. This page used to render a
 * section per `MenuItem.kind` (Food, Drinks, Desserts…) with five per-kind
 * sibling pages beside it; that enum is gone, along with the pages, because two
 * sectionings of one menu can only ever disagree.
 *
 * `MenuItem.category` is required, so every item lands in exactly one section
 * and there is no "uncategorized" bucket to render.
 */
interface MenuListingProps {
  locale: string;
}

export async function MenuListing({ locale }: MenuListingProps) {
  const [categories, items, system, t, detailT, menuT] = await Promise.all([
    getMenuCategories(),
    getAllMenuItems(),
    getSystem(),
    getTranslations("FoodPage"),
    getTranslations("CategoryDetail"),
    getTranslations("Menu"),
  ]);

  /** The category's own name for the rendered locale, with the usual fallback:
   *  English reads `en_name` and falls back to the Spanish copy, everything else
   *  the other way round. */
  const categoryName = (c: (typeof categories)[number]) =>
    (locale === "en" ? c.en_name : c.name) ?? c.name ?? c.en_name ?? c.slug;

  const heading = t("heading");

  const breadcrumbs: BreadcrumbItem[] = [
    { label: detailT("home"), href: "/" },
    { label: detailT("food") },
  ];

  // One section per category that has something in it - an empty category still
  // gets its *card* above (the card states its own count), but an empty grid
  // under a heading reads as a broken page.
  //
  // Driven by `categories` rather than by grouping `items`, so the sections come
  // out in the order the operator dragged them into in the CMS
  // (`MenuCategory.sort_order`) instead of whatever order the items arrived in.
  const sections: {
    key: string;
    heading: string;
    items: MenuItemDetail[];
  }[] = categories
    .map((c) => ({
      key: c.slug,
      heading: categoryName(c),
      items: items.filter((item) => item.category === c.id),
    }))
    .filter((section) => section.items.length > 0);

  /** The `id` the category rail scrolls to - the section's own heading, so the
   *  reader lands on the title rather than mid-grid. */
  const sectionHeadingId = (key: string) => `menu-section-${key}`;

  /** Which categories have a section on this page - i.e. which category cards
   *  can scroll to their dishes instead of leading to the category's own page.
   *  An empty category has a card and no section, and keeps the link. */
  const sectionKeys = new Set(sections.map((section) => section.key));

  // The tenant's brandmark cradled on the rail's top edge, on the same
  // "Framed heading" switch (`hero_text_frame`) that decides whether the hero
  // frames its heading and the footer cradles the mark - a site that wears the
  // frame wears it here too. With no brandmark there is nothing to cradle.
  const railBrandmark = system?.hero_text_frame ? system.img_brandmark : null;

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
                const description =
                  (locale === "en" ? cat.en_description : cat.description) ??
                  cat.description ??
                  cat.en_description ??
                  "";
                const card = (
                  <CategoryCard
                    id={cat.id}
                    name={categoryName(cat)}
                    description={description}
                    image={cat.image}
                    itemCount={cat.item_count}
                    type="food"
                    href={menuCategoryHref(cat.slug)}
                  />
                );
                return (
                  <Grid key={cat.id} size={{ xs: 6, sm: 4, lg: 3 }}>
                    {/* The card keeps its href - it is the category's real
                     *  address, and the one an empty category (no section
                     *  below) still needs - but on this page the dishes are
                     *  further down the same page, so the click scrolls to the
                     *  section heading exactly as the rail's entries do. */}
                    {sectionKeys.has(cat.slug) ? (
                      <ScrollToSectionLink
                        targetId={sectionHeadingId(cat.slug)}
                      >
                        {card}
                      </ScrollToSectionLink>
                    ) : (
                      card
                    )}
                  </Grid>
                );
              })}
            </Grid>
          </section>
        )}
        {/* The item grids and the category rail beside them. The rail is a grid
         *  cell of its own so it is `hidden` below `md` with no media query, and
         *  so it stretches to the full height of the sections column - which is
         *  what its `position: sticky` travels inside. */}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }} hidden={{ xs: true, sm: true }}>
            <MenuCategoryNav
              title={t("categoryNav")}
              brandmark={railBrandmark}
              brandmarkAlt={system?.site_name ?? ""}
              // The rail's lead spacer drops the same top padding the first
              // section drops, so both columns start level either way.
              flushTop={!hasCategories}
              items={sections.map((section) => ({
                targetId: sectionHeadingId(section.key),
                label: section.heading,
              }))}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 9 }}>
            {sections.map((section, index) => (
              <section
                key={section.key}
                className={sectionClassName(!hasCategories && index === 0)}
              >
                <Box
                  marginBottom={32}
                  display="flex"
                  flexDirection="column"
                  gap={10}
                >
                  <Typography
                    as="h2"
                    variant="h2"
                    className="section-title"
                    id={sectionHeadingId(section.key)}
                    // The rail's target: clear the fixed navbar the scroll would
                    // otherwise park this heading under.
                    styles={{
                      scrollMarginTop:
                        "calc(var(--ui-navbar-height, 57px) + 16px)",
                    }}
                  >
                    {section.heading}
                  </Typography>
                </Box>
                <Grid container spacing={2}>
                  {section.items.map((item) => (
                    // Three across from `md` up: that is where the rail claims
                    // its column, and a fourth card in the remaining 9/12 comes
                    // out too narrow to read.
                    <Grid key={item.id} size={{ xs: 6, sm: 3, md: 4 }}>
                      <BuyableCard
                        item={{ kind: "food", data: item }}
                        locale={locale}
                        fromLabel={menuT("from")}
                      />
                    </Grid>
                  ))}
                </Grid>
              </section>
            ))}
          </Grid>
        </Grid>
        {items.length === 0 && (
          <Typography variant="none" className="section-subtitle">
            {menuT("empty")}
          </Typography>
        )}
      </Container>
    </>
  );
}
