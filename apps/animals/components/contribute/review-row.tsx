import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * One "label: value" line in a contribute flow's review stage.
 *
 * A row with nothing in it and no `fallback` is not rendered at all: the review is
 * a summary of what will be filed, not a checklist of what was skipped. Every
 * optional field passing a "not given" fallback would turn a two-line coyote
 * proposal into a fourteen-line form of blanks, which is exactly the wall of empty
 * fields the staging exists to avoid.
 */

interface Props {
  label: string;
  value: string | null;
  /** Rendered muted when `value` is empty. Omit to hide the row instead. */
  fallback?: string;
}

export function ReviewRow({ label, value, fallback }: Props) {
  const filled = (value ?? "").trim();
  if (!filled && !fallback) return null;

  return (
    <Box gap={10} flexWrap="wrap" alignItems="baseline">
      <Typography
        variant="label"
        fontWeight={700}
        color="var(--foreground-muted, #6b7280)"
        styles={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
      >
        {label}
      </Typography>
      <Typography
        variant="body"
        color={filled ? undefined : "var(--foreground-muted, #6b7280)"}
        // A contributed description keeps the line breaks it was typed with; the
        // published page renders it as markdown, but this is the raw draft.
        styles={{ whiteSpace: "pre-wrap" }}
      >
        {filled || fallback}
      </Typography>
    </Box>
  );
}
