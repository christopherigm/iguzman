import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import type {
  ProductCategory,
  ServiceCategory,
  MenuCategory,
  FeaturedProduct,
  FeaturedService,
  MenuItemDetail,
} from "@/lib/catalog";
import { BuyableCard, type BuyableItem } from "./buyable-card";

type CategoryDetailProps =
  | {
      category: ProductCategory;
      kind: "product";
      items: FeaturedProduct[];
      locale: string;
      /** Pass true when there is no hero image so the title is shown inline. */
      showTitle?: boolean;
    }
  | {
      category: ServiceCategory;
      kind: "service";
      items: FeaturedService[];
      locale: string;
      showTitle?: boolean;
    }
  | {
      category: MenuCategory;
      kind: "food";
      items: MenuItemDetail[];
      locale: string;
      showTitle?: boolean;
    };

export async function CategoryDetail({
  category,
  kind,
  items,
  locale,
  showTitle = false,
}: CategoryDetailProps) {
  const [t, tCatalog, tMenu] = await Promise.all([
    getTranslations("CategoryDetail"),
    getTranslations("CatalogItems"),
    getTranslations("Menu"),
  ]);

  const name =
    (locale === "en" ? category.en_name : category.name) ??
    category.name ??
    category.en_name ??
    "";

  // Products, services and food all share BuyableCard for a consistent grid;
  // a food card just drops the add-to-cart control (it links to its customiser).
  // `items` is cast per branch because destructuring `kind` off the union loses
  // its correlation with `items`.
  const heading =
    kind === "product"
      ? t("products")
      : kind === "service"
        ? t("services")
        : t("food");
  const count = items.length;

  return (
    <Box flexDirection="column" paddingBottom={56}>
      {/* Title - only shown when there is no hero image */}
      {showTitle && name && (
        <Typography as="h1" variant="h2" marginBottom={12}>
          {name}
        </Typography>
      )}

      {/* Items section */}
      <Box alignItems="baseline" gap={12} flexWrap="wrap" marginBottom={24}>
        <Typography as="h2" variant="h3" className="section-title">
          {heading}
        </Typography>
        {count > 0 && (
          <Typography
            as="span"
            variant="h6"
            fontWeight={500}
            color="var(--foreground)"
          >
            {count}
          </Typography>
        )}
      </Box>

      {count === 0 ? (
        <Box paddingY={48}>
          <Typography variant="none" className="section-subtitle">
            {t("noItems")}
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {(kind === "product"
            ? (items as FeaturedProduct[]).map(
                (data): BuyableItem => ({ kind: "product", data }),
              )
            : kind === "service"
              ? (items as FeaturedService[]).map(
                  (data): BuyableItem => ({ kind: "service", data }),
                )
              : (items as MenuItemDetail[]).map(
                  (data): BuyableItem => ({ kind: "food", data }),
                )
          ).map((item) => (
            <Grid key={`${item.kind}-${item.data.id}`} size={{ xs: 6, sm: 3 }}>
              <BuyableCard
                item={item}
                locale={locale}
                productLabel={tCatalog("productLabel")}
                serviceLabel={tCatalog("serviceLabel")}
                menuLabel={tCatalog("menuLabel")}
                fromLabel={tMenu("from")}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
