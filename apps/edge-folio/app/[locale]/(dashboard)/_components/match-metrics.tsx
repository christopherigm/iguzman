"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import "./match-metrics.css";

/** Shared colour scale for any match percentage (green / amber / red). */
export function metricColor(value: number): string {
  return value >= 70 ? "#22c55e" : value >= 45 ? "#f59e0b" : "#ef4444";
}

export function MetricBar({
  label,
  value,
  size = 6,
  explainAriaLabel,
  onExplain,
}: {
  label: string;
  value: number;
  size?: number;
  explainAriaLabel?: string;
  onExplain?: () => void;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={4}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box display="flex" alignItems="center" gap={6}>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {label}
          </Typography>
        </Box>
        <Box display="flex" gap={8} alignItems="center">
          <Typography
            variant="body"
            fontWeight={600}
            color={metricColor(value)}
          >
            {value}%
          </Typography>
          {onExplain && (
            <Button
              type="button"
              onClick={onExplain}
              aria-label={explainAriaLabel}
              className="match-metric__explain-btn"
            >
              ?
            </Button>
          )}
        </Box>
      </Box>
      <ProgressBar value={value} size={size} label={label} />
    </Box>
  );
}

export interface MatchMetricItem {
  /** i18n-resolved label (e.g. "Overall match"). */
  label: string;
  value: number;
  /** Optional long-form explanation; enables the "?" explain button. */
  explanation?: string;
}

/**
 * Renders a stack of match metric bars. Shared by the job-application detail page
 * and the jobs feed cards so both present the same scoring consistently.
 */
export function MatchMetrics({
  items,
  explainAriaLabel,
  onExplain,
  gap = 10,
  barSize = 6,
}: {
  items: MatchMetricItem[];
  explainAriaLabel?: string;
  onExplain?: (item: MatchMetricItem) => void;
  gap?: number;
  barSize?: number;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={gap}>
      {items.map((item) => (
        <MetricBar
          key={item.label}
          label={item.label}
          value={item.value}
          size={barSize}
          explainAriaLabel={explainAriaLabel}
          onExplain={
            onExplain && item.explanation ? () => onExplain(item) : undefined
          }
        />
      ))}
    </Box>
  );
}
