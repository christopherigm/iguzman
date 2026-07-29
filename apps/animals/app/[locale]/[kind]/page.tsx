import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import {
  getCategoriesByKind,
  kindFromSlug,
  type Category,
} from "@/lib/catalog";
import { getKindMapPins, getSightingsByKind } from "@/lib/journal";
import {
  DetailHero,
  type DetailHeroChip,
} from "@/components/catalog/detail-hero";
import { SightingsSection } from "@/components/journal/sightings-section";
import { SightingsMapSection } from "@/components/journal/sightings-map-section";
import { CategoryNav } from "../category-nav";

/**
 * One of the five top-level branches: `/[locale]/animals`, `/plants`, `/fungi`,
 * `/seasons`, `/weather`.
 *
 * The level the site was missing. A category page is one group ('Deer'), a
 * species page one subject - this is the whole branch above them: its
 * categories as the landing's own tile field, then what has been seen in it
 * lately, then where. Reached from a category's eyebrow and breadcrumb.
 *
 * **A branch is an enum value, not a record** (`KIND_CHOICES` in animals-api,
 * and the note in its `catalog/models.py` on why it is deliberately not a
 * table), so there is nothing to fetch for it and nothing an author can upload
 * to it. Everything on this page is therefore *derived*: the title comes from
 * next-intl (`Kinds`), the counts from the categories it holds, and the hero
 * photograph is borrowed from one of them - see `heroCategory`.
 *
 * ⚠ **`[kind]` is a top-level dynamic segment**, so it also catches every path
 * under a locale that no static route claimed (`/en/nonsense`). Next matches
 * `categories`, `species`, `sightings`, `admin`, `account` and the auth group
 * first; `kindFromSlug` answering `null` is what turns everything else into the
 * 404 it was before this route existed. Adding a static route under
 * `app/[locale]/` still wins over this one - no edit needed here.
 */

type Props = { params: Promise<{ locale: string; kind: string }> };

/** How many journal entries the branch's sightings band carries. */
const SIGHTINGS_LIMIT = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, kind: segment } = await params;
  const kind = kindFromSlug(segment);
  if (!kind) return {};

  // Cast as in `app/[locale]/layout.tsx`: the `{ locale, namespace }` overload
  // wants next-intl's `Locale` union, and a route param is a bare `string`, so
  // the typed-message keys resolve to `never` without it.
  type Translate = (key: string, values?: Record<string, string>) => string;
  const tKinds = (await getTranslations({
    locale,
    namespace: "Kinds",
  })) as Translate;
  const t = (await getTranslations({
    locale,
    namespace: "KindPage",
  })) as Translate;

  const name = tKinds(kind);
  const description = t("metaDescription", { kind: name });

  // The same read the page makes, so the card image is the same photograph the
  // reader lands on. Next memoises a GET within one request, so this is not a
  // second round trip in practice - and if it were, it would be one cached list.
  const hero = heroCategory(await getCategoriesByKind(kind));

  return {
    title: name,
    description,
    openGraph: {
      title: name,
      description,
      ...(hero?.image ? { images: [{ url: hero.image }] } : {}),
    },
  };
}

export default async function KindPage({ params }: Props) {
  const { locale, kind: segment } = await params;
  setRequestLocale(locale);

  const kind = kindFromSlug(segment);
  // Not a branch - and, because this segment is the locale's catch-all, not a
  // page of any kind. See the note at the top.
  if (!kind) notFound();

  const t = await getTranslations("KindPage");
  const tCategory = await getTranslations("CategoryPage");
  const tKinds = await getTranslations("Kinds");
  const format = await getFormatter({ locale });

  // Three independent bands, so they are fetched together; each fetcher answers
  // an empty list rather than throwing, so a dead backend costs a band and not
  // the page (`lib/catalog.ts` → `fetchList`).
  const [categories, sightings, mapPins] = await Promise.all([
    getCategoriesByKind(kind),
    getSightingsByKind(kind, SIGHTINGS_LIMIT),
    getKindMapPins(kind),
  ]);

  const name = tKinds(kind);
  const hero = heroCategory(categories);

  // Counted from the list on screen rather than from `/api/catalog/kinds/`,
  // which is the same call the category page makes about its species: the two
  // agree except when the API and this page disagree about what is visible, and
  // then the honest number is the one the reader can actually reach.
  const speciesCount = categories.reduce(
    (total, item) => total + item.species_count,
    0,
  );

  const chips: DetailHeroChip[] = [];
  if (categories.length > 0) {
    // One ICU message rather than a formatted number beside a bare noun: a
    // branch with a single category is common (`weather`, `season`), and every
    // locale here inflects it - "1 categorías" would be visibly wrong. `#`
    // formats the number itself, so there is no `format.number` to add.
    chips.push({
      key: "categories",
      label: t("categoriesCount", { count: categories.length }),
    });
  }
  if (speciesCount > 0) {
    chips.push({
      key: "species",
      label: `${format.number(speciesCount)} ${tCategory("speciesCount")}`,
    });
  }

  const breadcrumbs = [
    { label: tCategory("breadcrumbHome"), href: "/" },
    { label: name },
  ];

  return (
    <Box flexDirection="column" width="100%">
      {/* No `icon`: a branch has no mark of its own, and one borrowed from a
          category would read as this branch's - the photograph beneath it is a
          backdrop, a glyph would be a claim. `fit`/`background_color` do come
          from the source category, so a plate authored as `contain` is
          letterboxed here exactly as it is on its own page. */}
      <DetailHero
        image={hero?.image ?? null}
        icon={null}
        fit={hero?.fit ?? "cover"}
        backgroundColor={hero?.background_color ?? null}
        eyebrow={t("eyebrow")}
        title={name}
        scientificName={null}
        chips={chips}
      />

      <Container size="lg" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        <Box marginTop={40}>
          {categories.length > 0 ? (
            // The landing's own tile field, narrowed to this branch - the same
            // component, so a tile looks and links identically on both pages
            // (and keeps its branch colour, which here is the whole field's).
            <CategoryNav
              categories={categories}
              locale={locale}
              title={t("categoriesTitle")}
              subtitle={t("categoriesSubtitle", { kind: name })}
            />
          ) : (
            // A branch with nothing filed under it yet is a normal state, not an
            // error: the five exist in the schema whether or not anyone has
            // photographed one.
            <Typography variant="body" color="var(--foreground-muted, #6b7280)">
              {t("noCategories")}
            </Typography>
          )}
        </Box>

        {sightings.length > 0 && (
          <Box marginTop={56}>
            <SightingsSection
              sightings={sightings}
              locale={locale}
              title={t("sightingsTitle")}
              subtitle={t("sightingsSubtitle", { kind: name })}
            />
          </Box>
        )}

        {/* Under the recent entries, as on a category page: the band above is
            *what* was seen lately, this is *where* the whole branch has been.
            Every filter but `category` is offered - one branch holds many
            categories, so that dropdown is the useful one here, unlike on a
            category page where it could only ever be a no-op. */}
        {mapPins.length > 0 && (
          <Box marginTop={56}>
            <SightingsMapSection
              pins={mapPins}
              locale={locale}
              title={t("mapTitle")}
              subtitle={t("mapSubtitle", { kind: name })}
              filters={["category", "species", "location", "year"]}
            />
          </Box>
        )}
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}

/**
 * The category whose photograph stands in as the branch's hero, or `undefined`
 * when none of them has one (`DetailHero` then draws its flat header, which is
 * a first-class branch, not a placeholder).
 *
 * A branch owns no image - it is an enum value - so the hero is **borrowed**,
 * and this is the whole of that decision: a featured category with a photograph
 * first, else simply the first category with one. Both fall out of the order the
 * API already returns (`kind`, `sort_order`, `name`), which means an author
 * chooses this photograph the way they choose everything else on a branch - by
 * featuring a category, or by ordering them - rather than through a field that
 * does not exist.
 */
function heroCategory(categories: Category[]): Category | undefined {
  const withImage = categories.filter((category) => Boolean(category.image));
  return withImage.find((category) => category.is_featured) ?? withImage[0];
}
