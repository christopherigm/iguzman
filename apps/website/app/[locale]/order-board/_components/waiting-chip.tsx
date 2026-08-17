"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@repo/ui/core-elements/badge";
import { WAITING_COLOR, minutesWaiting, waitingLevel } from "@/lib/order-board";

interface Props {
  /** The order's `created_at`. */
  createdAt: string;
  /** The board's clock, ticking on the poll - never `Date.now()` read here, or
   *  every chip would drift apart from every other one. */
  now: number;
  size?: "sm" | "md" | "lg";
}

/**
 * How long a ticket has been waiting, coloured by how overdue it is.
 *
 * One component for both the list row and the open ticket, so the two can never
 * round the same order to different minutes or paint it at different levels.
 */
export function WaitingChip({ createdAt, now, size = "sm" }: Props) {
  const t = useTranslations("OrderBoard");
  const minutes = minutesWaiting(createdAt, now);

  return (
    <Badge
      variant="subtle"
      size={size}
      color={WAITING_COLOR[waitingLevel(minutes)]}
    >
      {minutes < 60
        ? t("waitMinutes", { minutes })
        : t("waitHours", {
            hours: Math.floor(minutes / 60),
            // Padded so "1h 05m" cannot be misread as "1h 5m" at a glance
            // across a counter.
            minutes: String(minutes % 60).padStart(2, "0"),
          })}
    </Badge>
  );
}
