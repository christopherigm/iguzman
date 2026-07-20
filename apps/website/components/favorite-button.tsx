"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import type { IconButtonSize } from "@repo/ui/core-elements/icon-button";
import { useGuestState } from "@/hooks/use-guest-cart";
import { isGuestFavorite, toggleGuestFavorite } from "@/lib/guest-cart";

interface FavoriteButtonProps {
  kind: "product" | "service" | "menu_item";
  /** The catalog item's id - not the Favorite row's. */
  id: number;
  /** Server-rendered initial state, from `isFavorite()`. */
  initialFavorite: boolean;
  isLoggedIn: boolean;
  size?: IconButtonSize;
  /**
   * Stop the click reaching an enclosing link. Set when the button sits on top
   * of a card that is itself a link (the favorites grid), where a bare click
   * would otherwise navigate to the item instead of unsaving it.
   */
  stopPropagation?: boolean;
}

/**
 * The heart toggle. Red (`kind="error"`) when saved, neutral when not.
 *
 * Works signed in or out, from two different sources of truth. For a customer it
 * is a row: `initialFavorite` is server-rendered, the click writes through the
 * API, and `router.refresh()` re-runs the server components so every other heart
 * on screen agrees with the DB. For a guest it is localStorage, read through
 * `useGuestState` - which also means the state is only known after hydration, so
 * a guest's saved hearts fill in a frame late. That is the trade for a heart
 * that works without an account at all; it used to send them to /auth.
 *
 * Optimistic in the signed-in case: the icon flips on click and rolls back only
 * if the request fails, so the button never feels laggy. The guest case needs no
 * optimism - the write is synchronous.
 */
export function FavoriteButton({
  kind,
  id,
  initialFavorite,
  isLoggedIn,
  size = "md",
  stopPropagation = false,
}: FavoriteButtonProps) {
  const t = useTranslations("ItemDetail");
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [isPending, startTransition] = useTransition();
  const guest = useGuestState();

  // A logged-out heart is whatever localStorage says; `initialFavorite` is the
  // server's answer and is always false for a guest, so it is not consulted.
  const isFavorite = isLoggedIn ? favorite : isGuestFavorite(guest, kind, id);

  const label = isFavorite ? t("removeFromFavorites") : t("addToFavorites");

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!isLoggedIn) {
      // The store notifies every subscriber, so this heart and the favorites
      // page repaint together with no round-trip.
      toggleGuestFavorite(kind, id);
      return;
    }

    const next = !favorite;
    setFavorite(next);

    startTransition(async () => {
      try {
        const res = next
          ? await fetch("/api/auth/favorites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind, id }),
            })
          : await fetch(`/api/auth/favorites/${kind}/${id}`, {
              method: "DELETE",
            });

        if (!res.ok) {
          setFavorite(!next);
          return;
        }
        router.refresh();
      } catch {
        setFavorite(!next);
      }
    });
  };

  return (
    <IconButton
      icon="/icons/favorite.svg"
      aria-label={label}
      title={label}
      aria-pressed={isFavorite}
      kind={isFavorite ? "error" : "default"}
      size={size}
      disabled={isPending}
      onClick={handleClick}
      translucent
    />
  );
}
