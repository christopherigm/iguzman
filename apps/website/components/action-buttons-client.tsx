"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import "./action-buttons-client.css";

interface ActionButtonsClientProps {
  addToCartLabel: string;
  buyNowLabel: string;
}

export function ActionButtonsClient({
  addToCartLabel,
  buyNowLabel,
}: ActionButtonsClientProps) {
  return (
    <Box className="action-buttons">
      <Button text={addToCartLabel} size="lg" width="100%" />
      <Button text={buyNowLabel} size="lg" width="100%" />
    </Box>
  );
}
