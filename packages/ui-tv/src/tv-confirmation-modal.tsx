import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode, Ref } from 'react';
import { TvButton } from './tv-button';
import { TvText } from './tv-typography';
import { onBackButton } from './remote-keys';
import './tv-confirmation-modal.css';

export interface TvConfirmationModalProps {
  /** Modal heading. */
  title: string;
  /** Optional descriptive line shown below the title. */
  text?: string;
  /** Called when the user confirms (remote Enter on OK). */
  okCallback: () => void;
  /**
   * Called when the user cancels. When provided a "Cancel" button is rendered;
   * the remote Back button also triggers it. Falls back to `okCallback` when
   * omitted (OK is then the only way out).
   */
  cancelCallback?: () => void;
  /** Content rendered between the text and the action buttons (e.g. options). */
  children?: ReactNode;
  /** Label for the confirm button. @default 'OK' */
  okLabel?: string;
  /** Label for the cancel button. @default 'Cancel' */
  cancelLabel?: string;
  /** Render the OK button disabled. */
  okDisabled?: boolean;
  /** Override the panel's max-width (CSS value). @default '1500px' */
  panelMaxWidth?: string;
}

/**
 * TvConfirmationModal - 10-foot adaptation of @repo/ui's `ConfirmationModal`.
 *
 * Drawn over a full-screen overlay via a portal. Unlike the web version it has
 * no pointer affordances: it traps D-pad focus inside the panel
 * (`isFocusBoundary`) so the remote can't wander onto the screen behind it, and
 * the Back button dismisses. Written for old Tizen Chromium (76) - explicit
 * `width`/`height` instead of `inset`, `rgba()` instead of `color-mix()`, and
 * margins instead of flex `gap` (see packages/ui-tv/CLAUDE.md).
 */
export function TvConfirmationModal({
  title,
  text,
  okCallback,
  cancelCallback,
  children,
  okLabel = 'OK',
  cancelLabel = 'Cancel',
  okDisabled = false,
  panelMaxWidth = '1500px',
}: TvConfirmationModalProps) {
  // Trap focus inside the panel and delegate the initial focus to its first
  // focusable child (an option button, or OK when there are none).
  const { ref, focusKey, focusSelf } = useFocusable({
    isFocusBoundary: true,
    trackChildren: true,
    saveLastFocusedChild: true,
  });

  // Dismissing (Back button) falls back to OK when there's no cancel handler.
  const dismiss = cancelCallback ?? okCallback;

  useEffect(() => {
    focusSelf();
  }, [focusSelf]);

  useEffect(() => onBackButton(dismiss), [dismiss]);

  if (typeof document === 'undefined') return null;

  const modal = (
    <FocusContext.Provider value={focusKey}>
      <div className="tv-modal-overlay">
        <div
          ref={ref as Ref<HTMLDivElement>}
          className="tv-modal-panel"
          style={{ maxWidth: panelMaxWidth }}
          role="dialog"
          aria-modal="true"
        >
          <div className="tv-modal-body">
            <TvText variant="title" className="tv-modal-title">
              {title}
            </TvText>
            {text && (
              <TvText variant="body" className="tv-modal-text">
                {text}
              </TvText>
            )}
            {children && <div className="tv-modal-content">{children}</div>}
          </div>

          <div className="tv-modal-actions">
            {cancelCallback && <TvButton onPress={cancelCallback}>{cancelLabel}</TvButton>}
            <TvButton kind="primary" onPress={okCallback} disabled={okDisabled}>
              {okLabel}
            </TvButton>
          </div>
        </div>
      </div>
    </FocusContext.Provider>
  );

  return createPortal(modal, document.body);
}

export default TvConfirmationModal;
