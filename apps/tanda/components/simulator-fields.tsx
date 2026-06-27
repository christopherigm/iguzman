import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";

// Small presentational pieces shared across the Simulator's comparison panels.
// Kept out of simulator.tsx so the main component reads as composition, not
// markup plumbing.

/** Round "?" button that opens an explanation modal for an adjacent label. */
export function ExplainBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label="Learn more"
      className="simulator__explain-btn"
    >
      ?
    </Button>
  );
}

/** A single label/value row in a comparison panel, with an optional explainer. */
export function ResultRow({
  label,
  value,
  highlight,
  shaded,
  onExplain,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  shaded?: boolean;
  onExplain?: () => void;
}) {
  return (
    <Box
      display="flex"
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      padding="12px 20px"
      backgroundColor={shaded ? "var(--surface-2)" : "var(--surface-1)"}
    >
      <Box display="flex" alignItems="center" gap={6}>
        <Typography>{label}</Typography>
        {onExplain && <ExplainBtn onClick={onExplain} />}
      </Box>
      <Typography
        fontWeight={highlight ? 700 : 500}
        color={highlight ? "var(--accent, #06b6d4)" : "var(--foreground)"}
        styles={{ fontSize: highlight ? 20 : undefined }}
        textAlign="right"
        minWidth={130}
      >
        {value}
      </Typography>
    </Box>
  );
}
