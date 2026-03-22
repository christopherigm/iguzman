'use client';

import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import './action-buttons-client.css';

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
      <Button
        text={addToCartLabel}
        width="100%"
        styles={{
          padding: '13px 24px',
          borderRadius: '8px',
          fontSize: '15px',
          fontWeight: 600,
          backgroundColor: 'var(--accent)',
          color: '#fff',
        }}
      />
      <Button
        text={buyNowLabel}
        width="100%"
        border="1.5px solid var(--accent)"
        styles={{
          padding: '13px 24px',
          borderRadius: '8px',
          fontSize: '15px',
          fontWeight: 600,
          backgroundColor: 'transparent',
          color: 'var(--accent)',
        }}
      />
    </Box>
  );
}
