import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Switch } from "@repo/ui/core-elements/switch";

export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={12}
    >
      <Typography variant="body">{label}</Typography>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </Box>
  );
}

export function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <Box display="flex" flexDirection="column" gap={4}>
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {label}
      </Typography>
      <Typography variant="body" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}

export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card gap={4}>
      <InfoField label={label} value={value} />
    </Card>
  );
}
