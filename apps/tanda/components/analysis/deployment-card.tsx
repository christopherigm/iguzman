import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { Badge } from "@repo/ui/core-elements/badge";
import { ServerImageToggle } from "@/components/server-image-toggle";

/** Infrastructure card: server photo, intro, tech stack, and deployment specs. */
export function DeploymentCard({
  imageAlt,
  imageCaption,
  toggleLabel,
  intro,
  techStackLabel,
  techStack,
  deployLabel,
  specs,
}: {
  imageAlt: string;
  imageCaption: string;
  toggleLabel: string;
  intro: string;
  techStackLabel: string;
  techStack: string[];
  deployLabel: string;
  specs: { label: string; value: string }[];
}) {
  return (
    <Card padding={0} styles={{ overflow: "hidden" }}>
      {/* Server photo (Kubernetes node behind Cloudflare) - centered 4:3 frame.
          Click to swap between server.jpg and server-2.jpg. */}
      <ServerImageToggle imageAlt={imageAlt} toggleLabel={toggleLabel} />
      <Box
        padding="8px 16px"
        backgroundColor="var(--surface-2)"
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
      >
        <Typography variant="caption" color="var(--muted-foreground)">
          {imageCaption}
        </Typography>
      </Box>

      {/* Intro + tech stack */}
      <Box display="flex" flexDirection="column" gap={16} padding="16px">
        <Typography styles={{ lineHeight: 1.6 }} color="var(--foreground)">
          {intro}
        </Typography>

        <Box display="flex" flexDirection="column" gap={8}>
          <Typography fontWeight={600} color="var(--muted-foreground)">
            {techStackLabel}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={8}>
            {techStack.map((tech) => (
              <Badge key={tech} variant="subtle" color="var(--accent, #06b6d4)">
                {tech}
              </Badge>
            ))}
          </Box>
        </Box>

        <Typography fontWeight={600} color="var(--muted-foreground)">
          {deployLabel}
        </Typography>
      </Box>

      {/* Deployment specs */}
      <Box display="flex" flexDirection="column" gap={0}>
        {specs.map((row, idx, arr) => (
          <Box
            key={row.label}
            display="flex"
            flexDirection="column"
            gap={4}
            padding="12px 16px"
            backgroundColor={
              idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"
            }
            styles={{
              borderTop: "1px solid var(--border, #e5e7eb)",
              borderBottom:
                idx === arr.length - 1
                  ? undefined
                  : "1px solid var(--border, #e5e7eb)",
            }}
          >
            <Typography
              fontWeight={700}
              color="var(--accent, #06b6d4)"
              styles={{ fontFamily: "monospace" }}
            >
              {row.label}
            </Typography>
            <Typography
              styles={{
                lineHeight: 1.6,
                minWidth: 0,
                overflowWrap: "anywhere",
              }}
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

export default DeploymentCard;
