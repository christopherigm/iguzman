"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@repo/ui/core-elements/badge";
import type { BadgeSize } from "@repo/ui/core-elements/badge";
import type { ContributionStatus } from "@/lib/contributions";

/**
 * Where a contribution stands, as one `Badge`.
 *
 * Shared by the grid and the edit page rather than written in each, because the
 * colour is the thing a contributor reads first and two copies would drift - and
 * because the middle state is easy to get wrong.
 *
 * ⚠ **`in_review` is not a second shade of `pending`.** Both are `enabled:
 * false` on the API and differ only by `was_published`, but they mean opposite
 * things to the person who filed them: `pending` is "nothing has happened yet",
 * while `in_review` is "this **was** on the site and your edit has taken it off
 * until someone approves it". So it takes the warning colour, not the neutral
 * one - it is the only state that describes something the reader has lost, and
 * the only one they might want to undo.
 *
 * The colours are named rather than taken from the palette accent on purpose:
 * this is a status, so it has to read the same on every site the brand kit could
 * repaint. `--success` / `--warning` / `--foreground-muted` are the tokens every
 * palette in `@repo/ui` defines.
 */

const TONE: Record<
  ContributionStatus,
  { color: string; variant: "filled" | "subtle" }
> = {
  // Live on the public site: the only state worth a solid fill, because it is
  // the one that is finished.
  published: { color: "var(--success, #16a34a)", variant: "filled" },
  // Waiting for a first look. Quiet - nothing is wrong and nothing is lost.
  pending: { color: "var(--foreground-muted, #6b7280)", variant: "subtle" },
  // Was live, is not now. See the note above.
  in_review: { color: "var(--warning, #f59e0b)", variant: "filled" },
};

interface Props {
  status: ContributionStatus;
  size?: BadgeSize;
  /** Set when the badge floats over a photograph rather than over the card. */
  translucent?: boolean;
}

export function ContributionStatusBadge({
  status,
  size = "sm",
  translucent = false,
}: Props) {
  const t = useTranslations("Contributions");
  const tone = TONE[status];

  return (
    <Badge
      variant={tone.variant}
      size={size}
      color={tone.color}
      translucent={translucent}
    >
      {t(`status_${status}`)}
    </Badge>
  );
}
