import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import {
  getProductCategories,
  getServiceCategories,
  getMenuCategories,
  type ProductCategory,
  type ServiceCategory,
  type MenuCategory,
} from "@/lib/catalog";
import { menuCategoryHref } from "@/lib/menu-paths";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Badge } from "@repo/ui/core-elements/badge";
import { getSession } from "@repo/auth/session";
import { AdminEditButton } from "./admin-edit-button";
import "./catalog-categories.css";

type CategoryType = "product" | "service" | "food";

/** A category card carries its **name** and its count, and deliberately no
 *  description: the cards are an index - a row of them is read as a list of
 *  names, and two clamped lines of prose under each one turns that into a wall
 *  of text without helping anyone choose. The description still belongs to the
 *  category (the CMS keeps authoring it) and the category's own page renders
 *  it in full. */
interface CategoryCardProps {
  id: number;
  name: string;
  image: string | null;
  itemCount: number;
  type: CategoryType;
  href: string;
}

export async function CategoryCard({
  id,
  name,
  image,
  itemCount,
  type,
  href,
}: CategoryCardProps) {
  const label =
    type === "product" ? "Product" : type === "service" ? "Service" : "Menu";
  const countLabel =
    type === "product"
      ? `${itemCount} product${itemCount !== 1 ? "s" : ""}`
      : type === "service"
        ? `${itemCount} service${itemCount !== 1 ? "s" : ""}`
        : `${itemCount} item${itemCount !== 1 ? "s" : ""}`;

  const hasImage = Boolean(image);
  // Service badge picks up an accent tint only on flat (image-less) cards;
  // product cards and every image card use the light-on-dark treatment.
  const accentBadge = type === "service" && !hasImage;

  // Admin edit shortcut, keyed to the per-kind category admin route. Resolved
  // per card; `getSession` is `cache()`d per request so a grid of N cards costs
  // one session decode between them. Only rendered for an admin viewer.
  const [session, tAdmin] = await Promise.all([
    getSession(),
    getTranslations("Admin"),
  ]);

  const adminEditHref =
    type === "product"
      ? `/admin/product-categories/${id}`
      : type === "service"
        ? `/admin/service-categories/${id}`
        : `/admin/menu-categories/${id}`;

  return (
    <Card
      href={href}
      prefetch
      padding={0}
      border="none"
      borderRadius={8}
      elevation={5}
      backgroundColor="var(--surface-2)"
      className="zoom-on-hover"
      styles={{
        // Portrait 4:5 - the same frame `BuyableCardView` gives an item photo,
        // so a grid of categories and the grid of items below it read as one
        // catalog rather than two. Here the photo *is* the card (the name and
        // the count sit over it), so the ratio belongs to the card itself; a
        // flat, image-less card keeps it too, or a mixed row comes out ragged.
        position: "relative",
        aspectRatio: "4 / 5",
        textDecoration: "none",
      }}
    >
      {image && (
        <Image fill src={image} alt={name} style={{ objectFit: "cover" }} />
      )}
      {image && (
        <Box
          styles={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 25%, rgba(0,0,0,0) 50%)",
          }}
        />
      )}

      {/* Kind badge rides the top-left corner over the image. */}
      <Badge
        variant="filled"
        size="md"
        textColor={accentBadge ? "var(--accent, #6366f1)" : "#fff"}
        uppercase
        style={{ position: "absolute", top: 8, left: 8, zIndex: 2 }}
      >
        {label}
      </Badge>

      {/* Admin-only edit shortcut, riding the top-right corner. */}
      {session?.isAdmin && (
        <Box styles={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>
          <AdminEditButton
            href={adminEditHref}
            label={tAdmin("edit")}
            size="sm"
            solid
          />
        </Box>
      )}

      <Box
        flexDirection="column"
        gap={10}
        flex={1}
        justifyContent="flex-end"
        className="card-content"
        styles={{ position: "relative", zIndex: 1 }}
      >
        {name && (
          <Typography
            as="h3"
            variant="h3"
            margin={0}
            color={hasImage ? "#fff" : "var(--foreground)"}
            // The card's height is now the 4:5 frame's, and a Card clips its
            // own overflow - so a long category name is clamped rather than
            // pushed out of the bottom of the picture it is written over.
            styles={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {name}
          </Typography>
        )}

        <Typography
          as="span"
          variant="label"
          color={hasImage ? "#fff" : "var(--foreground)"}
        >
          {countLabel}
        </Typography>
      </Box>
    </Card>
  );
}

export async function CatalogCategories() {
  const [productCategories, serviceCategories, menuCategories, locale, t] =
    await Promise.all([
      getProductCategories(),
      getServiceCategories(),
      getMenuCategories(),
      getLocale(),
      getTranslations("CatalogCategories"),
    ]);

  if (
    productCategories.length === 0 &&
    serviceCategories.length === 0 &&
    menuCategories.length === 0
  )
    return null;

  return (
    <section className="catalog-section">
      <Box className="highlights-header">
        <Typography as="h2" variant="h2" className="section-title">
          {t("heading")}
        </Typography>
      </Box>
      <Grid container spacing={2}>
        {productCategories.map((cat: ProductCategory) => {
          const name =
            (locale === "en" ? cat.en_name : cat.name) ??
            cat.name ??
            cat.en_name ??
            "";
          return (
            <Grid key={`product-${cat.id}`} size={{ xs: 6, sm: 4, md: 3 }}>
              <CategoryCard
                id={cat.id}
                name={name}
                image={cat.image}
                itemCount={cat.item_count}
                type="product"
                href={`/categories/products/${cat.slug}/`}
              />
            </Grid>
          );
        })}
        {serviceCategories.map((cat: ServiceCategory) => {
          const name =
            (locale === "en" ? cat.en_name : cat.name) ??
            cat.name ??
            cat.en_name ??
            "";
          return (
            <Grid key={`service-${cat.id}`} size={{ xs: 6, sm: 4, md: 3 }}>
              <CategoryCard
                id={cat.id}
                name={name}
                image={cat.image}
                itemCount={cat.item_count}
                type="service"
                href={`/categories/services/${cat.slug}/`}
              />
            </Grid>
          );
        })}
        {menuCategories.map((cat: MenuCategory) => {
          const name =
            (locale === "en" ? cat.en_name : cat.name) ??
            cat.name ??
            cat.en_name ??
            "";
          return (
            <Grid key={`food-${cat.id}`} size={{ xs: 6, sm: 4, md: 3 }}>
              <CategoryCard
                id={cat.id}
                name={name}
                image={cat.image}
                itemCount={cat.item_count}
                type="food"
                href={menuCategoryHref(cat.slug)}
              />
            </Grid>
          );
        })}
      </Grid>
    </section>
  );
}
