"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { FavoriteButtonClient } from "./favorite-button-client";

interface ActionButtonsClientProps {
  addToCartLabel: string;
  buyNowLabel: string;
  favoriteLabel: string;
}

export function ActionButtonsClient({
  addToCartLabel,
  buyNowLabel,
  favoriteLabel,
}: ActionButtonsClientProps) {
  return (
    // Single compact row: secondary + primary CTAs share the width, the
    // favorite toggle sits inline at the end. Wraps gracefully on very narrow
    // widths so the buttons never get crushed.
    <Box alignItems="center" gap={10} width="100%" flexWrap="wrap">
      <Button text={addToCartLabel} size="lg" flex="1" minWidth={140} />
      <Button
        text={buyNowLabel}
        kind="primary"
        size="lg"
        flex="1"
        minWidth={140}
      />
      <FavoriteButtonClient label={favoriteLabel} />
    </Box>
  );
}
