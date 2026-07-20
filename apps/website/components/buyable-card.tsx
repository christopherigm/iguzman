import { getTranslations } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import type {
  FeaturedProduct,
  FeaturedService,
  MenuItemDetail,
  BuyableVariant,
} from "@/lib/catalog";
import { findCartLineId } from "@/lib/cart";
import { isFavorite } from "@/lib/favorites";
import { getRequestOrigin } from "@/lib/metadata";
import { BuyableCardView } from "./buyable-card-view";

export type BuyableItem =
  | { kind: "product"; data: FeaturedProduct }
  | { kind: "service"; data: FeaturedService }
  | { kind: "food"; data: MenuItemDetail };

function defaultVariant(
  variants: BuyableVariant[],
): BuyableVariant | undefined {
  return variants.find((v) => v.is_default) ?? variants[0];
}

/**
 * A catalog card, with everything only the server can answer resolved first.
 *
 * The rendering lives in `BuyableCardView`; this half exists because the heart
 * and the add-to-cart button need per-viewer state, and the card rides on every
 * grid in the app rather than having each one thread that state down. All four
 * reads are `cache()`d per request, so a grid of N cards costs one session
 * decode, one favorites fetch and one cart fetch between them - and an anonymous
 * visitor costs no fetch at all, because their cart and hearts live in their
 * browser and `BuyableCardView`'s buttons read them there after hydration.
 */
export async function BuyableCard({
  item,
  locale,
  productLabel,
  serviceLabel,
  menuLabel,
  fromLabel,
}: {
  item: BuyableItem;
  locale: string;
  productLabel: string;
  serviceLabel: string;
  /** Corner badge label for a `food` item; required when a food card renders. */
  menuLabel?: string;
  /**
   * "from" prefix for a `food` item's price - add-ons raise it, so the card
   * price is a starting point. Required when a food card renders.
   */
  fromLabel?: string;
}) {
  const { kind, data } = item;

  // The favorites API knows a menu item as `menu_item`; product/service keep
  // their own kind. This is the only place the two names diverge.
  const favoriteKind = kind === "food" ? "menu_item" : kind;

  const [session, favorite, origin, tAdmin] = await Promise.all([
    getSession(),
    isFavorite(favoriteKind, data.id),
    getRequestOrigin(),
    getTranslations("Admin"),
  ]);

  // Only product/service carry variants; a menu item is priced whole and
  // customised on its detail page, so it has no card-level variant.
  const variant =
    item.kind === "food" ? undefined : defaultVariant(item.data.variants);

  // Whether the card's own variant is already a line, and which line it is - the
  // button turns into "remove" and needs the row's id to delete it. A food card
  // adds the base (default-ingredients) line, so it resolves the uncustomised
  // menu line. Read after `variant` resolves because the variant is half the
  // line's identity.
  const cartLineId =
    item.kind === "food"
      ? await findCartLineId("menu_item", data.id, null)
      : await findCartLineId(item.kind, data.id, variant?.id ?? null);

  return (
    <BuyableCardView
      item={item}
      locale={locale}
      productLabel={productLabel}
      serviceLabel={serviceLabel}
      menuLabel={menuLabel}
      fromLabel={fromLabel}
      origin={origin}
      isAdmin={session?.isAdmin ?? false}
      editLabel={tAdmin("edit")}
      isLoggedIn={session !== null}
      initialFavorite={favorite}
      cartLineId={cartLineId}
    />
  );
}
