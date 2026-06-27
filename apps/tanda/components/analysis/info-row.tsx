import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";

/** A stacked label/value row inside an alternating-stripe info card. */
export function InfoRow({
  label,
  value,
  idx,
  last,
}: {
  label: string;
  value: string;
  idx: number;
  last: boolean;
}) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={6}
      padding="14px 16px"
      backgroundColor={idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"}
      styles={{
        borderBottom: last ? undefined : "1px solid var(--border, #e5e7eb)",
      }}
    >
      <Typography fontWeight={600}>{label}</Typography>
      <Typography
        styles={{
          lineHeight: 1.6,
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
        color="var(--foreground)"
      >
        {value}
      </Typography>
    </Box>
  );
}

export default InfoRow;
