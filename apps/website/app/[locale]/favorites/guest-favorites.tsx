"use client";

import { useEffect, useState } from "react";
import { Grid } from "@repo/ui/core-elements/grid";
import { useGuestState } from "@/hooks/use-guest-cart";
import type { FavoriteItem } from "@/lib/favorites";
import { BuyableCardView } from "@/components/buyable-card-view";
import type { BuyableItem } from "@/components/buyable-card";

interface GuestFavoritesProps {
  locale: string;
  productLabel: string;
  serviceLabel: string;
  menuLabel: string;
  fromLabel: string;
  /** The request origin, for each card's share link - only the server knows it. */
  origin: string;
  /** The empty-state call to action plus the Categories grid, rendered on the
   *  server (it is async and reads the catalog) and handed down as an element
   *  because this component cannot render a server component itself. */
  emptyState: React.ReactNode;
}

/**
 * A logged-out visitor's saved items.
 *
 * localStorage holds only `{kind, id}` references, so this resolves them through
 * `/api/guest/resolve` into the same `FavoriteItem` payload the signed-in page
 * renders, and draws them with `BuyableCardView` - the client half of the same
 * card. Re-resolves whenever the local state changes, which is what makes
 * un-hearting a card here drop it from the grid immediately.
 *
 * The per-viewer props are all the logged-out constants: no admin shortcut, no
 * server-known heart or cart line. Each card's own buttons read the real guest
 * state from localStorage themselves.
 */
export function GuestFavorites({
  locale,
  productLabel,
  serviceLabel,
  menuLabel,
  fromLabel,
  origin,
  emptyState,
}: GuestFavoritesProps) {
  const guest = useGuestState();
  // `null` means "not resolved yet", telling a first load apart from a list
  // whose references all turned out to be dead. Nothing is set synchronously in
  // the effect: an empty local list is decided during render, since the browser
  // already knows that without asking.
  const [favorites, setFavorites] = useState<FavoriteItem[] | null>(null);

  const refs = guest.favorites;
  const isEmpty = refs.length === 0;

  useEffect(() => {
    if (isEmpty) return;

    // Guards against an out-of-order response overwriting a newer one.
    let current = true;

    const run = async () => {
      try {
        const res = await fetch("/api/guest/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart: [], favorites: refs }),
        });
        if (!res.ok) return;

        const data = (await res.json()) as { favorites: FavoriteItem[] };
        if (current) setFavorites(data.favorites);
      } catch {
        // Keep the last good list rather than blanking the page.
      }
    };

    void run();

    return () => {
      current = false;
    };
  }, [refs, isEmpty]);

  // Not resolved yet - render nothing rather than flashing "no favorites yet".
  if (!isEmpty && favorites === null) return null;

  if (isEmpty || favorites === null || favorites.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <Grid container spacing={2}>
      {favorites.map((favorite) => (
        <Grid
          key={`${favorite.kind}-${favorite.item.id}`}
          size={{ xs: 6, sm: 3, lg: 2 }}
        >
          <BuyableCardView
            item={
              {
                // The favorites API keys food as `menu_item`; the card knows it
                // as `food`.
                kind: favorite.kind === "menu_item" ? "food" : favorite.kind,
                data: favorite.item,
              } as BuyableItem
            }
            locale={locale}
            productLabel={productLabel}
            serviceLabel={serviceLabel}
            menuLabel={menuLabel}
            fromLabel={fromLabel}
            origin={origin}
            isAdmin={false}
            editLabel=""
            isLoggedIn={false}
            initialFavorite={false}
            cartLineId={null}
          />
        </Grid>
      ))}
    </Grid>
  );
}
