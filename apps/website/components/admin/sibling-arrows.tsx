"use client";

import { useTranslations } from "next-intl";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import type { AdminSiblings } from "@/hooks/use-admin-siblings";

/**
 * One of the two arrows that flank a detail form's Save button, stepping to the
 * previous or next record in the CMS list without going back to the table.
 *
 * Rendered as a pair either side of Save - `AdminForm` does that for the twelve
 * forms it owns, and the three pages that hand-roll their own action bar
 * (coupons, social posts, users) draw the same pair themselves.
 *
 * Nothing renders when `siblings` is undefined, which is how an unsaved record -
 * with no place in the list to step from - opts out.
 */
export function SiblingArrow({
  direction,
  siblings,
  size = "md",
}: {
  direction: "prev" | "next";
  siblings: AdminSiblings | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const t = useTranslations("Admin");
  if (!siblings) return null;

  const href = direction === "prev" ? siblings.prevHref : siblings.nextHref;
  const label = t(direction === "prev" ? "previousItem" : "nextItem");

  // No `href` when there is no neighbour: IconButton only renders a Link when
  // one is given, so the end of the list is a real disabled <button> rather than
  // a live link to nowhere. `type` defaults to "button", so an arrow sitting
  // inside a <form> never submits it.
  return (
    <IconButton
      icon={`/icons/${direction}.svg`}
      size={size}
      aria-label={label}
      title={label}
      href={href}
      disabled={href === undefined}
    />
  );
}
