'use client';

import React, { useEffect, useRef } from 'react';
import { Button } from './button';
import { Box } from './box';
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
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Close when clicking the overlay (outside the panel)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (
      cancelCallback &&
      panelRef.current &&
      !panelRef.current.contains(e.target as Node)
    ) {
      cancelCallback();
    }
  };

  return (
    <div className="ui-confirmation-modal-overlay" onClick={handleOverlayClick}>
      <div ref={panelRef} className="ui-confirmation-modal-panel">
        <div className="ui-confirmation-modal-body">
          <h2 className="ui-confirmation-modal-title">{title}</h2>
          <p className="ui-confirmation-modal-text">{text}</p>
        </div>

        <Box className="ui-confirmation-modal-actions">
          {cancelCallback && (
            <Button
              text="Cancel"
              onClick={cancelCallback}
              backgroundColor="var(--surface-1, rgba(0, 0, 0, 0.06))"
              color="var(--foreground, #1a1a1a)"
              padding="8px 16px"
              borderRadius={8}
            />
          )}
          <Button
            text="OK"
            onClick={okCallback}
            padding="8px 16px"
            borderRadius={8}
          />
        </Box>
      </div>
    </div>
  );
};

export default ConfirmationModal;
