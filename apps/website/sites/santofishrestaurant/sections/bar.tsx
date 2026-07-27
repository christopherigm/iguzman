import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  getMenuCategories,
  getMenuItemsByKind,
  type MenuItemDetail,
} from "@/lib/catalog";
import { formatPrice } from "@/lib/price";

/**
 * "La Barra" - the bar half of a Mexican seafood *grill and bar*.
 *
 * Santo Fish's food is already carried by the shared catalog blocks, so this
 * section exists for one reason: to give the bar its own moment instead of
 * letting it be the ninth tile in a category grid. It is the only section on the
 * landing shaped like a **printed bar list** - a dark photographic panel with
 * name-and-price rows under dotted leaders - which is what keeps the page from
 * reading as four stacked card grids.
 *
 * Everything visible is DB-driven: the panel is one of the tenant's own
 * `MenuCategory` rows (its image, name and description) plus its drinks and
 * their live prices.
 *
 * **What counts as a drink is `MenuItem.kind`, not the category's name.** The
 * section asks the API for `?kind=drink` and then dresses the panel with the
 * first of the tenant's categories that actually holds one. This used to be a
 * 24-word keyword list matched against category names, which needed
 * accent-stripping and whole-word-only matching to keep "barbacoa" and
 * "cocteles y caldos" (shrimp cocktails - food) from matching, and still broke
 * silently the moment the tenant renamed the category in the CMS. A slug or id
 * literal is no better: `seed_site` host-namespaces every slug, so one would
 * break as soon as the site were re-seeded on another host. `kind` is set per
 * item and survives all of it.
 *
 * Because the list is now keyed on the items rather than the category, a bar
 * snack filed under the same category no longer appears in the price list -
 * only drinks do. If no category holds an available drink, the section renders
 * nothing, exactly like the shared blocks.
 *
 * Deliberately contained rather than full-bleed: a full-width opaque band
 * outside `SectionBand` would paint over the tenant's logo watermark and page
 * background. Here the page shows through on both sides of the panel.
 */

function pick(
  locale: string,
  es: string | null | undefined,
  en: string | null | undefined,
): string {
  return ((locale === "en" ? en : es) || es || en || "").trim();
}

/** One "name .......... price" row of the bar list. */
function BarLine({
  item,
  locale,
  onImage,
}: {
  item: MenuItemDetail;
  locale: string;
  onImage: boolean;
}) {
  const name = pick(locale, item.name, item.en_name);
  const color = onImage ? "#fff" : "var(--foreground)";
  const rule = onImage ? "rgba(255,255,255,0.35)" : "var(--border)";

  return (
    <Box display="flex" alignItems="baseline" gap="8px" width="100%">
      <Typography as="span" variant="body" color={color} fontWeight={600}>
        {name}
      </Typography>
      <Box
        flex={1}
        styles={{ borderBottom: `1px dotted ${rule}`, minWidth: 16 }}
      />
      <Typography as="span" variant="body" color={color}>
        {formatPrice(item.price, item.currency)}
      </Typography>
    </Box>
  );
}

export async function Bar() {
  const [categories, drinks, locale, t] = await Promise.all([
    getMenuCategories(),
    getMenuItemsByKind("drink"),
    getLocale(),
    getTranslations("SantoFishSite"),
  ]);

  const available = drinks.filter((item) => item.is_available);

  // The panel's photo, heading, copy and CTA are a real MenuCategory, so pick
  // the first of the tenant's own categories (their CMS order) that holds a
  // drink. Keying the choice on the items is what makes a rename harmless.
  const category = categories.find((cat) =>
    available.some((item) => item.category === cat.id),
  );
  if (!category) return null;

  // Scoped to that category so the CTA below leads to exactly this list; a
  // drink filed elsewhere belongs to that category's own page.
  const items = available
    .filter((item) => item.category === category.id)
    .slice(0, 8);

  const name = pick(locale, category.name, category.en_name);
  const description = pick(
    locale,
    category.description,
    category.en_description,
  );

  // With a category photo the panel goes dark and the type turns light-on-dark
  // (the same legibility idiom the shared category cards use); without one it
  // stays a neutral surface in the visitor's theme.
  const onImage = Boolean(category.image);
  const textColor = onImage ? "#fff" : "var(--foreground)";

  return (
    <Container paddingX={10}>
      <Box paddingY={64}>
        <Box
          width="100%"
          borderRadius={16}
          elevation={8}
          backgroundColor="var(--surface-2)"
          styles={{ position: "relative", overflow: "hidden" }}
        >
          {category.image && (
            <>
              <Image
                fill
                src={category.image}
                alt={name}
                sizes="(max-width: 900px) 100vw, 1100px"
                style={{ objectFit: "cover" }}
              />
              {/* Flat tint, not a gradient: the copy sits on the left on wide
                  screens and stacks over the whole panel on mobile, so an even
                  darkening is the only one legible at every width. */}
              <Box
                styles={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.68)",
                }}
              />
            </>
          )}

          <Box padding={32} styles={{ position: "relative", zIndex: 1 }}>
            <Grid container spacing={4}>
              <Grid size={{ xs: 12, sm: 5 }}>
                <Box display="flex" flexDirection="column" gap="16px">
                  <Typography
                    as="span"
                    variant="label"
                    color={onImage ? "#fff" : "var(--accent)"}
                    fontWeight={700}
                    styles={{
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    {t("bar.eyebrow")}
                  </Typography>

                  <Typography
                    as="h2"
                    variant="h2"
                    fontWeight={800}
                    color={textColor}
                    margin={0}
                  >
                    {name}
                  </Typography>

                  {description && (
                    <Typography
                      as="p"
                      variant="body"
                      color={textColor}
                      margin={0}
                      styles={{ lineHeight: 1.7, maxWidth: "48ch" }}
                    >
                      {description}
                    </Typography>
                  )}

                  <Box marginTop={8}>
                    <Button
                      text={t("bar.cta")}
                      href={`/categories/food/${category.slug}/`}
                      kind="primary"
                      size="lg"
                    />
                  </Box>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 7 }}>
                <Box display="flex" flexDirection="column" gap="14px">
                  {items.map((item) => (
                    <BarLine
                      key={item.id}
                      item={item}
                      locale={locale}
                      onImage={onImage}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}
