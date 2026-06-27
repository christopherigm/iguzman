import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { Badge } from "@repo/ui/core-elements/badge";

/** A stakeholder persona card: accent-bordered header + goal/profile body. */
export function StakeholderCard({
  icon,
  accent,
  name,
  category,
  goalLabel,
  goal,
  profileLabel,
  profile,
}: {
  icon: string;
  accent: string;
  name: string;
  category: string;
  goalLabel: string;
  goal: string;
  profileLabel: string;
  profile: string;
}) {
  return (
    <Card
      padding={0}
      display="flex"
      flexDirection="column"
      styles={{ overflow: "hidden", height: "100%" }}
    >
      <Box
        padding="12px 16px"
        display="flex"
        alignItems="center"
        gap={10}
        styles={{
          borderLeft: `4px solid ${accent}`,
          borderBottom: "1px solid var(--border, #e5e7eb)",
        }}
      >
        <Typography styles={{ fontSize: 22 }}>{icon}</Typography>
        <Box
          display="flex"
          flexDirection="column"
          gap={6}
          alignItems="flex-start"
          styles={{ minWidth: 0, flex: 1 }}
        >
          <Typography
            fontWeight={700}
            color="var(--foreground)"
            styles={{ minWidth: 0, overflowWrap: "anywhere" }}
          >
            {name}
          </Typography>
          <Badge variant="subtle" size="sm" color={accent}>
            {category}
          </Badge>
        </Box>
      </Box>
      <Box
        display="flex"
        flexDirection="column"
        gap={12}
        padding="14px 16px"
        styles={{ flex: 1 }}
      >
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography fontWeight={600} color="var(--muted-foreground)">
            {goalLabel}
          </Typography>
          <Typography
            styles={{ lineHeight: 1.6, minWidth: 0, overflowWrap: "anywhere" }}
            color="var(--foreground)"
          >
            {goal}
          </Typography>
        </Box>
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography fontWeight={600} color="var(--muted-foreground)">
            {profileLabel}
          </Typography>
          <Typography
            styles={{ lineHeight: 1.6, minWidth: 0, overflowWrap: "anywhere" }}
            color="var(--foreground)"
          >
            {profile}
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}

export default StakeholderCard;
