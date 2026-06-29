import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * A web source consulted for the AI analysis, rendered as a stacked
 * title / clickable link / snippet row inside an alternating-stripe list.
 * Mirrors the layout of {@link InfoRow}.
 *
 * When `main` is set, the row is the deep-dived "main article consulted": it is
 * highlighted with a dashed primary-color border and a leading label.
 */
export function SourceRow({
  title,
  url,
  snippet,
  idx,
  last,
  main = false,
  mainLabel,
}: {
  title: string;
  url: string;
  snippet: string;
  idx: number;
  last: boolean;
  main?: boolean;
  mainLabel?: string;
}) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={4}
      padding="14px 8px"
      borderRadius={main ? 8 : undefined}
      backgroundColor={
        main
          ? "color-mix(in srgb, var(--accent) 8%, transparent)"
          : idx % 2 === 0
            ? "var(--surface-1)"
            : "var(--surface-2)"
      }
      styles={
        main
          ? { border: "2px dashed var(--accent)" }
          : {
              borderBottom: last
                ? undefined
                : "1px solid var(--border, #e5e7eb)",
            }
      }
    >
      {main && mainLabel ? (
        <Typography
          variant="label"
          fontWeight={700}
          color="var(--accent)"
          styles={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {mainLabel}
        </Typography>
      ) : null}
      <Typography fontWeight={600} color="var(--foreground)">
        {title || url}
      </Typography>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none", minWidth: 0 }}
      >
        <Typography
          variant="caption"
          color="var(--accent, #06b6d4)"
          styles={{ overflowWrap: "anywhere", textDecoration: "underline" }}
        >
          {url}
        </Typography>
      </a>
      {snippet ? (
        <Typography
          variant="caption"
          color="var(--muted-foreground, #6b7280)"
          styles={{ lineHeight: 1.6, minWidth: 0, overflowWrap: "anywhere" }}
        >
          {snippet}
        </Typography>
      ) : null}
    </Box>
  );
}

export default SourceRow;
