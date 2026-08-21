import { getTranslations } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import type {
  FeaturedProduct,
  FeaturedService,
  MenuItemDetail,
} from "@/lib/catalog";
import { findCartLineId } from "@/lib/cart";
import { isFavorite } from "@/lib/favorites";
import { getRequestOrigin } from "@/lib/metadata";
import { getSystem } from "@/lib/system";
import { BuyableCardView } from "./buyable-card-view";

export type BuyableItem =
  | { kind: "product"; data: FeaturedProduct }
  | { kind: "service"; data: FeaturedService }
  | { kind: "food"; data: MenuItemDetail };

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
  fromLabel,
  compact = false,
}: {
  item: BuyableItem;
  locale: string;
  /**
   * "from" prefix for a `food` item's price - add-ons raise it, so the card
   * price is a starting point. Required when a food card renders.
   */
  fromLabel?: string;
  /**
   * The card as it renders in a narrow column - see `BuyableCardView`'s own
   * `compact`. Passed straight through; nothing the server resolves changes,
   * because a compact card is the same card with less on it.
   */
  compact?: boolean;
}) {
  const { kind, data } = item;

  // The favorites API knows a menu item as `menu_item`; product/service keep
  // their own kind. This is the only place the two names diverge.
  const favoriteKind = kind === "food" ? "menu_item" : kind;

  const [session, favorite, origin, system, tAdmin, tBooking] =
    await Promise.all([
      getSession(),
      isFavorite(favoriteKind, data.id),
      getRequestOrigin(),
      // The global rewards switch, so the card may print a points price beside the
      // money one. `getSystem` is `cache()`d per request like the three reads
      // above it, so a grid of twenty cards costs one fetch between them.
      getSystem(),
      getTranslations("Admin"),
      // Resolved here rather than threaded through every grid that renders a
      // card: this half is already a server component with the request's locale,
      // and adding a required prop to a dozen call sites for one word would be
      // the worse trade.
      getTranslations("Booking"),
    ]);

  // Whether this card's item is already a line, and which line it is - the
  // button turns into "remove" and needs the row's id to delete it. A food card
  // adds the base (default-ingredients) line, so it resolves the uncustomised
  // menu line. A sibling variant is its own item with its own card.
  const cartLineId =
    item.kind === "food"
      ? await findCartLineId("menu_item", data.id)
      : await findCartLineId(item.kind, data.id);

  return (
    <BuyableCardView
      item={item}
      locale={locale}
      fromLabel={fromLabel}
      compact={compact}
      perPersonLabel={tBooking("perPerson")}
      rewardsEnabled={system?.rewards_enabled ?? false}
      origin={origin}
      isAdmin={session?.isAdmin ?? false}
      editLabel={tAdmin("edit")}
      isLoggedIn={session !== null}
      initialFavorite={favorite}
      cartLineId={cartLineId}
    />
  );
}
