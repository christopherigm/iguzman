'use client';

import React, { useEffect } from 'react';
import { Button } from './button';
import { Box } from './box';
import { Typography } from './typography';
import './confirmation-modal.css';

/**
 * Props for the `ConfirmationModal` component.
 */
export interface ConfirmationModalProps {
  /** Modal heading. */
  title: string;
  /** Descriptive message displayed below the title. */
  text: string;
  /** Called when the user confirms the action. */
  okCallback: () => void;
  /** Called when the user cancels. If provided a "Cancel" button is rendered. */
  cancelCallback?: () => void;
  /** Optional content rendered between the text and the action buttons. */
  children?: React.ReactNode;
  /** Override the panel's max-width (default: 420px). */
  panelMaxWidth?: string;
}

/**
 * ConfirmationModal — centered dialog drawn over a semi-transparent overlay.
 *
 * @example
 * <ConfirmationModal
 *   title="Delete item?"
 *   text="This action cannot be undone."
 *   okCallback={() => deleteItem()}
 *   cancelCallback={() => setOpen(false)}
 * />
 */
export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  title,
  text,
  okCallback,
  cancelCallback,
  children,
  panelMaxWidth,
}) => {
  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Close on Escape key when cancelCallback is available
  useEffect(() => {
    if (!cancelCallback) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelCallback();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelCallback]);

  // Close when clicking the overlay directly (not the panel)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (cancelCallback && e.target === e.currentTarget) cancelCallback();
  };

  return (
    <Box
      className="ui-confirmation-modal-overlay"
      display="flex"
      alignItems="center"
      justifyContent="center"
      backgroundColor="rgba(0, 0, 0, 0.55)"
      styles={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 1100,
        backdropFilter: 'blur(2px)',
      }}
      onClick={handleOverlayClick}
    >
      <Box
        className="ui-confirmation-modal-panel"
        role="dialog"
        aria-modal={true}
        aria-labelledby="ui-confirmation-modal-title"
        display="flex"
        flexDirection="column"
        width="90%"
        maxWidth={panelMaxWidth ?? '420px'}
        maxHeight="calc(90vh - 50px)"
        backgroundColor="var(--background, #ffffff)"
        borderRadius="12px"
        styles={{
          position: 'relative',
          zIndex: 1101,
          overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.18)',
        }}
      >
        <Box
          padding={24}
          flex="1 1 auto"
          minHeight={0}
          styles={{ overflowY: 'auto' }}
        >
          <Typography
            id="ui-confirmation-modal-title"
            as="h2"
            variant="h4"
            color="var(--foreground, #1a1a1a)"
            margin={0}
            marginBottom={8}
            // styles={{ fontSize: '18px' }}
          >
            {title}
          </Typography>
          <Typography
            as="p"
            variant="body-sm"
            margin={0}
            styles={{ lineHeight: 1.5 }}
          >
            {text}
          </Typography>
          {children && <Box marginTop={16}>{children}</Box>}
        </Box>

        <Box
          display="flex"
          justifyContent="flex-end"
          gap={8}
          padding="12px 24px 20px"
          styles={{
            flexShrink: 0,
            borderTop: '1px solid var(--border, rgba(0, 0, 0, 0.08))',
          }}
        >
          {cancelCallback && (
            <Button text="Cancel" onClick={cancelCallback} size="md" />
          )}
          <Button text="OK" onClick={okCallback} kind="success" size="md" />
        </Box>
      </Box>
    </Box>
  );
};

export default ConfirmationModal;
