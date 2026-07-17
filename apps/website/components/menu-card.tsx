import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import type { MenuItemDetail } from "@/lib/catalog";
import { formatPrice, discountPercent } from "@/lib/price";

/**
 * A menu item card. Unlike BuyableCard it carries no add-to-cart control: a
 * menu item is customised before it can be added, so the card links to the
 * detail page where the ingredient customiser lives. "from" prefixes the price
 * because add-ons can raise it.
 */
export function MenuCard({
  item,
  locale,
  fromLabel,
  unavailableLabel,
}: {
  item: MenuItemDetail;
  locale: string;
  fromLabel: string;
  unavailableLabel: string;
}) {
  const name =
    (locale === "en" ? item.en_name : item.name) ??
    item.name ??
    item.en_name ??
    "";
  const description =
    (locale === "en" ? item.en_short_description : item.short_description) ??
    (locale === "en" ? item.en_description : item.description) ??
    item.description ??
    "";

  const image = item.image ?? item.images.find((i) => i.image)?.image ?? null;
  const discount = item.compare_price
    ? discountPercent(item.price, item.compare_price)
    : 0;

  return (
    <Card
      href={`/menu/${item.slug}`}
      prefetch
      padding={0}
      border="none"
      elevation={5}
      height="100%"
      backgroundColor="var(--surface-1)"
      className="zoom-on-hover"
      styles={{ position: "relative", textDecoration: "none" }}
    >
      <Box
        width="100%"
        backgroundColor="var(--surface-3, #e5e7eb)"
        flex="0 0 auto"
        styles={{
          position: "relative",
          aspectRatio: "1 / 1",
          overflow: "hidden",
        }}
      >
        {image ? (
          <Image
            fill
            src={image}
            alt={name}
            sizes="(min-width: 1200px) 16vw, (min-width: 600px) 25vw, 50vw"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <Box
            backgroundColor={
              item.background_color ?? "var(--surface-3, #e5e7eb)"
            }
            styles={{ position: "absolute", inset: 0 }}
          />
        )}

        <Box
          alignItems="center"
          flexWrap="wrap"
          gap={4}
          styles={{ position: "absolute", top: 8, left: 8, zIndex: 1 }}
        >
          {item.is_vegan ? (
            <Badge variant="filled" size="sm" color="#16a34a" textColor="#fff">
              VG
            </Badge>
          ) : item.is_vegetarian ? (
            <Badge variant="filled" size="sm" color="#16a34a" textColor="#fff">
              V
            </Badge>
          ) : null}
          {item.is_gluten_free && (
            <Badge variant="filled" size="sm" color="#0891b2" textColor="#fff">
              GF
            </Badge>
          )}
        </Box>

        {discount > 0 && (
          <Box styles={{ position: "absolute", bottom: 8, left: 8, zIndex: 1 }}>
            <Badge variant="filled" size="sm" color="#ef4444" textColor="#fff">
              -{discount}%
            </Badge>
          </Box>
        )}
        {!item.is_available && (
          <Box
            styles={{ position: "absolute", bottom: 8, right: 8, zIndex: 1 }}
          >
            <Badge
              variant="filled"
              size="sm"
              color="rgba(0,0,0,0.6)"
              textColor="#fff"
            >
              {unavailableLabel}
            </Badge>
          </Box>
        )}
      </Box>

      <Box flexDirection="column" gap={6} flex={1} className="card-content">
        {name && (
          <Typography
            as="h3"
            variant="h5"
            margin={0}
            color="var(--on-surface)"
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
        {description && (
          <Typography
            variant="caption"
            margin={0}
            color="var(--on-surface-muted, rgba(0, 0, 0, 0.55))"
            styles={{
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {description}
          </Typography>
        )}
        <Box
          alignItems="baseline"
          gap={6}
          flexWrap="wrap"
          marginTop="auto"
          paddingTop={4}
        >
          <Typography
            as="span"
            variant="caption"
            color="var(--on-surface-muted, rgba(0, 0, 0, 0.5))"
          >
            {fromLabel}
          </Typography>
          <Typography
            as="span"
            variant="h6"
            fontWeight={700}
            color="var(--on-surface)"
          >
            {formatPrice(item.price, item.currency)}
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}
