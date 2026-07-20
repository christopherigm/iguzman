/**
 * Share-card copy helpers.
 *
 * Split out of `lib/metadata.ts` because that module imports `next/headers`
 * at the top level, which makes it unusable from a client component -
 * `BuyableCardView` renders the share button on the client. Everything here is
 * pure, so it works on either side.
 */

/** Cut-off for share-card copy. Facebook/X truncate well before this anyway. */
const SHARE_DESCRIPTION_MAX = 200;

/**
 * Collapses a catalog description into one-line share-card copy: whitespace
 * squashed, cut on a word boundary near {@link SHARE_DESCRIPTION_MAX}. The
 * backend has no short-description field, so the long body is all we have.
 */
export function toShareDescription(
  description: string | null | undefined,
): string | undefined {
  const text = description?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= SHARE_DESCRIPTION_MAX) return text;

  const clipped = text.slice(0, SHARE_DESCRIPTION_MAX);
  const lastSpace = clipped.lastIndexOf(" ");
  // Guard against a single very long word leaving us with almost nothing.
  const cut =
    lastSpace > SHARE_DESCRIPTION_MAX * 0.6 ? lastSpace : clipped.length;
  return `${clipped.slice(0, cut).trimEnd()}…`;
}
