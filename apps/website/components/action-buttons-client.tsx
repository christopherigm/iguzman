"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";

interface ActionButtonsClientProps {
  addToCartLabel: string;
  buyNowLabel: string;
}

export function ActionButtonsClient({
  addToCartLabel,
  buyNowLabel,
}: ActionButtonsClientProps) {
  return (
    <Box flexDirection="column" gap={10} width="100%">
      <Button text={addToCartLabel} size="lg" width="100%" />
      <Button text={buyNowLabel} size="lg" width="100%" />
    </Box>
  );
}
