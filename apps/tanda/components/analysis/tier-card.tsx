import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";

/** A risk-vertical (tier) card: colored header + term/delta/mitigation rows. */
export function TierCard({
  tier,
  name,
  term,
  delta,
  mitigation,
  color,
  icon,
  labels,
}: {
  tier: string;
  name: string;
  term: string;
  delta: string;
  mitigation: string;
  color: string;
  icon: string;
  labels: { tier: string; term: string; delta: string; mitigation: string };
}) {
  return (
    <Card padding={0} styles={{ overflow: "hidden" }}>
      <Box
        padding="10px 16px"
        display="flex"
        alignItems="center"
        gap={10}
        styles={{
          borderLeft: `4px solid ${color}`,
          borderBottom: "1px solid var(--border, #e5e7eb)",
        }}
      >
        <Typography>{icon}</Typography>
        <Typography fontWeight={700} color="var(--foreground)">
          {labels.tier} {tier}: {name}
        </Typography>
      </Box>
      <Box display="flex" flexDirection="column" gap={0}>
        {[
          { label: labels.term, value: term },
          { label: labels.delta, value: delta },
          { label: labels.mitigation, value: mitigation },
        ].map((row, idx, arr) => (
          <Box
            key={row.label}
            display="flex"
            flexDirection="column"
            padding="14px 16px"
            gap={6}
            backgroundColor={
              idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"
            }
            styles={{
              borderBottom:
                idx < arr.length - 1
                  ? "1px solid var(--border, #e5e7eb)"
                  : undefined,
            }}
          >
            <Typography fontWeight={600} color="var(--muted-foreground)">
              {row.label}
            </Typography>
            <Typography
              styles={{ minWidth: 0, overflowWrap: "anywhere" }}
              color="var(--foreground)"
            >
              {row.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

export default TierCard;
