import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";

/** A numbered analysis section: an accent-underlined heading above its content. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={16}>
      <Box
        padding="10px 0"
        styles={{ borderBottom: "2px solid var(--accent, #06b6d4)" }}
      >
        <Typography as="h2" fontWeight={700} color="var(--foreground)">
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

export default Section;
