"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { formatPrice } from "@/lib/price";

interface Props {
  count: number;
  total: number;
  currency: string;
  label: string;
  onOpen: () => void;
}

/**
 * The running total, pinned to the bottom of a phone screen.
 *
 * Only exists below `sm`, where the basket is a sheet rather than a second
 * column: without it the associate would be ringing items up with no visible
 * total, which is the one number the customer always asks for.
 */
export function PosMobileSummary({
  count,
  total,
  currency,
  label,
  onOpen,
}: Props) {
  return (
    <Box
      className="pos-mobile-bar"
      alignItems="center"
      justifyContent="space-between"
      gap={12}
      paddingX={14}
      paddingY={10}
      backgroundColor="var(--surface-2)"
    >
      <Box flexDirection="column">
        <Typography variant="caption" margin={0}>
          {count}
        </Typography>
        <Typography variant="h4" margin={0} fontWeight={700}>
          {formatPrice(total.toFixed(2), currency)}
        </Typography>
      </Box>
      <Button text={label} kind="primary" size="lg" onClick={onOpen} />
    </Box>
  );
}
