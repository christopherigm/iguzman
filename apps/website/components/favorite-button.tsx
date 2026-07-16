"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import type { IconButtonSize } from "@repo/ui/core-elements/icon-button";

interface FavoriteButtonProps {
  kind: "product" | "service";
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
 * Optimistic: the icon flips on click and only rolls back if the request fails,
 * so the button never feels laggy. The `router.refresh()` afterwards re-runs the
 * server components (which own the real state) so the favorites page and any
 * other heart on screen agree with the DB.
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

  const label = favorite ? t("removeFromFavorites") : t("addToFavorites");

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!isLoggedIn) {
      router.push("/auth");
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
      aria-pressed={favorite}
      kind={favorite ? "error" : "default"}
      size={size}
      disabled={isPending}
      onClick={handleClick}
      translucent
    />
  );
}
