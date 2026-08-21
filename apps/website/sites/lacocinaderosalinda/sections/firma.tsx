import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { getAllMenuItems, type MenuItemDetail } from "@/lib/catalog";
import { menuItemHref } from "@/lib/menu-paths";
import { formatPrice } from "@/lib/price";

/**
 * "La firma de la casa" - the dishes that carry Rosalinda's own name.
 *
 * The one thing this business has that no other food site in this repo does:
 * its signature runs *across* the menu rather than sitting in one section of
 * it. The printed carta names a dish after the cook in four different places -
 * the chilaquiles Rosalinda, the hot cakes Rosalinda, the Rosalinda botanero,
 * the sopes Rosalinda - and a visitor reading the menu category by category
 * never sees that thread, because each one is filed with its own kind of food.
 *
 * So this section gathers them, and it is deliberately the one section on the
 * page shaped like a **ruled two-column list** rather than a grid or a panel: a
 * photo, the dish, what is on it, the price, a hairline between each. It sits
 * directly under the Intro, so the visitor has just learned whose name these
 * carry.
 *
 * Everything visible is DB-driven - the tenant's own `MenuItem` rows, their
 * photos, their short descriptions and their live prices. Nothing here is
 * hardcoded copy but the section's own label, which is a translation like every
 * other block's heading.
 *
 * Deliberately **not** wrapped in a panel or a `SectionBand`: the tenant's logo
 * watermark and page background show through the whole section, and the only
 * other bordered-panel beat on this landing is the shared `Spotlight`.
 *
 * ⚠ **Which dishes are "the signature" is decided by `SIGNATURE_MATCH` below,
 * and that is the fragile part of this file.** There is no structural field on
 * a `MenuItem` that says "this one carries the house name" - the thread exists
 * only in the names the kitchen gave them. This is the same trade
 * `sites/santofishrestaurant/sections/bar.tsx` documents for its bar category,
 * and it is resolved the same way: **one** token, matched case-insensitively
 * against the dish's Spanish and English names, and a **soft failure** - if
 * nothing matches, the section renders nothing rather than filling itself with
 * whatever happened to come back first.
 *
 * A hard-coded list of slugs or ids would be worse: `seed_site` host-namespaces
 * every slug, so one would break the moment the site were re-seeded on another
 * host. If the kitchen renames the line, point `SIGNATURE_MATCH` at the new
 * word.
 */

/** The token a dish's name must contain to be part of the house's signature
 *  line. Matched case-insensitively against both language fields, so it
 *  survives "Chilaquiles Rosalinda" -> "Los Rosalinda" without surviving a
 *  rename to something else entirely - which is the honest failure here. */
const SIGNATURE_MATCH = "rosalinda";

/** How many signature dishes the section shows. Two columns of three: enough to
 *  read as a line rather than a coincidence, short enough not to become the
 *  menu itself (that is `/categories/menu`, two sections further down). */
const MAX_DISHES = 6;

function pick(
  locale: string,
  es: string | null | undefined,
  en: string | null | undefined,
): string {
  return ((locale === "en" ? en : es) || es || en || "").trim();
}

/** One "photo · dish · what's on it · price" row of the signature list. */
function SignatureRow({
  item,
  locale,
}: {
  item: MenuItemDetail;
  locale: string;
}) {
  const name = pick(locale, item.name, item.en_name);
  const description = pick(
    locale,
    item.short_description || item.description,
    item.en_short_description || item.en_description,
  );

  return (
    <Box
      href={menuItemHref(item.category_slug, item.slug)}
      prefetch
      display="flex"
      alignItems="center"
      gap="16px"
      paddingY={16}
      width="100%"
      styles={{
        borderTop: "1px solid var(--border)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {/* `zoom-on-hover` is this app's own interactivity signal for a linked
          photo (the catalog cards, the story cards and the category tiles all
          use it), so the row needs no hover CSS of its own - and no translateY
          lift. */}
      <Box
        className="zoom-on-hover"
        width={88}
        height={88}
        minWidth={88}
        borderRadius={12}
        backgroundColor="var(--surface-2)"
        styles={{ position: "relative", overflow: "hidden", flexShrink: 0 }}
      >
        {item.image && (
          <Image
            fill
            src={item.image}
            alt={name}
            sizes="88px"
            style={{ objectFit: "cover" }}
          />
        )}
      </Box>

      <Box
        display="flex"
        flexDirection="column"
        gap="4px"
        flex={1}
        minWidth={0}
      >
        <Typography as="span" variant="body" fontWeight={700} margin={0}>
          {name}
        </Typography>
        {description && (
          <Typography
            as="span"
            variant="body"
            color="var(--muted-foreground)"
            margin={0}
            styles={{ lineHeight: 1.6 }}
          >
            {description}
          </Typography>
        )}
      </Box>

      <Typography
        as="span"
        variant="body"
        fontWeight={700}
        margin={0}
        styles={{ whiteSpace: "nowrap" }}
      >
        {formatPrice(item.price, item.currency)}
      </Typography>
    </Box>
  );
}

export async function Firma() {
  const [items, locale, t] = await Promise.all([
    getAllMenuItems(),
    getLocale(),
    getTranslations("RosalindaSite"),
  ]);

  const matches = (value: string | null) =>
    (value ?? "").toLowerCase().includes(SIGNATURE_MATCH);
  const signature = items
    .filter(
      (item) =>
        item.is_available && (matches(item.name) || matches(item.en_name)),
    )
    .slice(0, MAX_DISHES);

  // Fails soft: no house-named dish (yet, or any more) means no section, rather
  // than a heading over whatever the catalog returned first.
  if (signature.length === 0) return null;

  return (
    <Container paddingX={10}>
      <Box paddingY={64}>
        <Box className="highlights-header" marginBottom={24}>
          <Typography
            as="span"
            variant="label"
            color="var(--accent-text)"
            fontWeight={700}
            styles={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            {t("firma.eyebrow")}
          </Typography>

          <Typography
            as="h2"
            variant="h2"
            fontWeight={800}
            className="section-title"
          >
            {t("firma.title")}
          </Typography>

          <Typography
            as="p"
            variant="none"
            className="section-subtitle"
            styles={{ maxWidth: "56ch" }}
          >
            {t("firma.subtitle")}
          </Typography>
        </Box>

        {/* Two columns from `sm` up, per the app's two-column rule - a ruled
            list is exactly the shape that wastes the tablet band when stacked.
            `spacingY={0}` keeps the rows tight so their hairlines read as one
            continuous rule; `spacingX` is the gutter between the columns. */}
        <Grid container spacingX={4} spacingY={0}>
          {signature.map((item) => (
            <Grid key={item.id} size={{ xs: 12, sm: 6 }}>
              <SignatureRow item={item} locale={locale} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Container>
  );
}
