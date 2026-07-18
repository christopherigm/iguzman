import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { getSession } from "@repo/auth/session";
import type { MenuItemDetail } from "@/lib/catalog";
import { isFavorite } from "@/lib/favorites";
import { toShareDescription } from "@/lib/metadata";
import { discountPercent } from "@/lib/price";
import { MenuItemCustomizer } from "./menu-item-customizer";
import { FavoriteButton } from "./favorite-button";

interface MenuDetailProps {
  item: MenuItemDetail;
  locale: string;
}

export async function MenuDetailPanel({ item, locale }: MenuDetailProps) {
  const [t, tMenu, session, favorite] = await Promise.all([
    getTranslations("ItemDetail"),
    getTranslations("Menu"),
    getSession(),
    isFavorite("menu_item", item.id),
  ]);

  const name =
    (locale === "en" ? item.en_name : item.name) ??
    item.name ??
    item.en_name ??
    "";

  const shareText =
    (locale === "en" ? item.en_description : item.description) ??
    item.description ??
    item.en_description ??
    "";

  const discount = item.compare_price
    ? discountPercent(item.price, item.compare_price)
    : 0;

  // Boolean dietary flags rendered as badges below the name. Vegan is the
  // stronger claim, so it supersedes the vegetarian badge rather than showing
  // both for the same dish.
  const dietary: string[] = [];
  if (item.is_organic) dietary.push(tMenu("organic"));
  if (item.is_vegan) dietary.push(tMenu("vegan"));
  else if (item.is_vegetarian) dietary.push(tMenu("vegetarian"));
  if (item.is_gluten_free) dietary.push(tMenu("glutenFree"));

  const hasFoodDetails =
    item.calories != null ||
    (item.spice_level != null && item.spice_level > 0) ||
    item.servings != null ||
    item.prep_time_minutes != null ||
    item.cook_time_minutes != null;

  return (
    <Box flexDirection="column" gap={18} paddingY={4}>
      <Box flexDirection="column" gap={8}>
        <Box alignItems="flex-start" justifyContent="space-between" gap={12}>
          {name && (
            <Typography
              as="h1"
              variant="h2"
              flex="1"
              minWidth={0}
              styles={{ lineHeight: 1.25 }}
            >
              {name}
            </Typography>
          )}
          <Box alignItems="center" gap={8}>
            <ShareButton
              title={name}
              text={toShareDescription(shareText)}
              label={t("share")}
              copiedLabel={t("linkCopied")}
              size="md"
            />
            <FavoriteButton
              kind="menu_item"
              id={item.id}
              initialFavorite={favorite}
              isLoggedIn={session !== null}
              size="md"
            />
          </Box>
        </Box>

        {/* Dietary badges - one per matching boolean flag */}
        {dietary.length > 0 && (
          <Box flexWrap="wrap" gap={6} alignItems="center">
            {dietary.map((label) => (
              <Badge
                key={label}
                variant="filled"
                size="lg"
                color="#16a34a"
                textColor="#fff"
              >
                {label}
              </Badge>
            ))}
          </Box>
        )}

        {item.category_name && (
          <Typography
            as="span"
            variant="caption"
            color="color-mix(in srgb, var(--foreground) 60%, transparent)"
          >
            {t("category")}: <strong>{item.category_name}</strong>
          </Typography>
        )}
      </Box>

      <Card gap={18}>
        <MenuItemCustomizer
          menuItemId={item.id}
          menuItemName={name}
          basePrice={item.price}
          comparePrice={item.compare_price}
          discount={discount}
          currency={item.currency}
          ingredients={item.ingredients}
          isAvailable={item.is_available}
          isLoggedIn={session !== null}
          locale={locale}
        />
      </Card>

      {/* Food details spec table */}
      {hasFoodDetails && (
        <Card>
          <Typography as="h2" variant="none" className="item-section-heading">
            {tMenu("foodDetails")}
          </Typography>
          <table className="item-specs-table">
            <tbody>
              {item.calories != null && (
                <tr>
                  <td>{tMenu("calories")}</td>
                  <td>{tMenu("caloriesValue", { value: item.calories })}</td>
                </tr>
              )}
              {item.spice_level != null && item.spice_level > 0 && (
                <tr>
                  <td>{tMenu("spiceLevel")}</td>
                  <td>{"🌶️".repeat(Math.min(item.spice_level, 5))}</td>
                </tr>
              )}
              {item.servings != null && (
                <tr>
                  <td>{tMenu("servings")}</td>
                  <td>{item.servings}</td>
                </tr>
              )}
              {item.prep_time_minutes != null && (
                <tr>
                  <td>{tMenu("prepTime")}</td>
                  <td>
                    {tMenu("minutesValue", { value: item.prep_time_minutes })}
                  </td>
                </tr>
              )}
              {item.cook_time_minutes != null && (
                <tr>
                  <td>{tMenu("cookTime")}</td>
                  <td>
                    {tMenu("minutesValue", { value: item.cook_time_minutes })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {item.allergens && (
        <Card>
          <Typography as="h2" variant="none" className="item-section-heading">
            {tMenu("allergens")}
          </Typography>
          <Typography
            variant="body"
            color="color-mix(in srgb, var(--foreground) 80%, transparent)"
          >
            {item.allergens}
          </Typography>
        </Card>
      )}
    </Box>
  );
}

/** Full-width long-form description below the buy box. */
export async function MenuDetailSections({ item, locale }: MenuDetailProps) {
  const t = await getTranslations("ItemDetail");

  const description =
    (locale === "en" ? item.en_description : item.description) ??
    item.description ??
    item.en_description ??
    "";

  if (!description) return null;

  return (
    <Card width="100%">
      <Typography as="h2" variant="none" className="item-section-heading">
        {t("description")}
      </Typography>
      <Typography
        variant="body"
        color="color-mix(in srgb, var(--foreground) 80%, transparent)"
        styles={{ lineHeight: 1.7, whiteSpace: "pre-line" }}
      >
        {description}
      </Typography>
    </Card>
  );
}
