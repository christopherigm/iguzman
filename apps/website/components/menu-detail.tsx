import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { getSession } from "@repo/auth/session";
import type { MenuItemDetail } from "@/lib/catalog";
import { toShareDescription } from "@/lib/metadata";
import { formatPrice, discountPercent } from "@/lib/price";
import { MenuItemCustomizer } from "./menu-item-customizer";

interface MenuDetailProps {
  item: MenuItemDetail;
  locale: string;
}

export async function MenuDetailPanel({ item, locale }: MenuDetailProps) {
  const [t, tMenu, session] = await Promise.all([
    getTranslations("ItemDetail"),
    getTranslations("Menu"),
    getSession(),
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

  const dietary: string[] = [];
  if (item.is_vegan) dietary.push(tMenu("vegan"));
  else if (item.is_vegetarian) dietary.push(tMenu("vegetarian"));
  if (item.is_gluten_free) dietary.push(tMenu("glutenFree"));

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
          <ShareButton
            title={name}
            text={toShareDescription(shareText)}
            label={t("share")}
            copiedLabel={t("linkCopied")}
            size="md"
          />
        </Box>

        {/* Dietary + spice + serving badges */}
        <Box flexWrap="wrap" gap={6} alignItems="center">
          {dietary.map((label) => (
            <Badge
              key={label}
              variant="filled"
              size="sm"
              color="#16a34a"
              textColor="#fff"
            >
              {label}
            </Badge>
          ))}
          {item.spice_level != null && item.spice_level > 0 && (
            <Badge variant="outlined" size="sm">
              {"🌶️".repeat(Math.min(item.spice_level, 5))}
            </Badge>
          )}
          {item.calories != null && (
            <Typography
              as="span"
              variant="caption"
              color="color-mix(in srgb, var(--foreground) 60%, transparent)"
            >
              {tMenu("caloriesValue", { value: item.calories })}
            </Typography>
          )}
          {item.servings != null && (
            <Typography
              as="span"
              variant="caption"
              color="color-mix(in srgb, var(--foreground) 60%, transparent)"
            >
              {tMenu("servesValue", { value: item.servings })}
            </Typography>
          )}
        </Box>

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

      <Card gap={16}>
        {/* Base price + compare */}
        <Box alignItems="baseline" flexWrap="wrap" gap="8px 12px">
          <Typography
            as="span"
            variant="caption"
            color="color-mix(in srgb, var(--foreground) 55%, transparent)"
          >
            {tMenu("from")}
          </Typography>
          <Typography as="span" variant="none" className="item-price">
            {formatPrice(item.price, item.currency)}
          </Typography>
          {item.compare_price &&
            parseFloat(item.compare_price) > parseFloat(item.price) && (
              <Typography
                as="span"
                variant="none"
                className="item-compare-price"
              >
                {formatPrice(item.compare_price, item.currency)}
              </Typography>
            )}
          {discount > 0 && (
            <Badge variant="filled" color="#ef4444" textColor="#fff">
              -{discount}%
            </Badge>
          )}
        </Box>

        <MenuItemCustomizer
          menuItemId={item.id}
          basePrice={item.price}
          currency={item.currency}
          ingredients={item.ingredients}
          isAvailable={item.is_available}
          isLoggedIn={session !== null}
          locale={locale}
        />
      </Card>

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
