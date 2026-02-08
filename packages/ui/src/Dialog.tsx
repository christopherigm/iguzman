import MUIDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';
import { Language } from '@iguzman/helpers/types';

/**
 * Props for the Dialog component
 */
export interface DialogProps {
  /** The content to display inside the dialog */
  children?: React.ReactNode;
  /** The language for localization */
  language: Language;
  /** The title of the dialog */
  title: string;
  /** The text content of the dialog */
  text?: string;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback function when user agrees */
  onAgreed: () => void;
  /** Callback function when user cancels */
  onCancel?: () => void;
  /** Whether the cancel button is enabled */
  cancelEnabled?: boolean;
}

/**
 * A customizable dialog component that displays a message with action buttons.
 *
 * @example
 * ```tsx
 * import { Dialog } from '@iguzman/ui/Dialog';
 *
 * function MyComponent() {
 *   const [open, setOpen] = useState(false);
 *
 *   return (
 *     <>
 *       <button onClick={() => setOpen(true)}>Open Dialog</button>
 *       <Dialog
 *         open={open}
 *         title="Confirmation"
 *         language="en"
 *         onAgreed={() => console.log('Agreed')}
 *         onCancel={() => setOpen(false)}
 *       >
 *         Are you sure you want to proceed?
 *       </Dialog>
 *     </>
 *   );
 * }
 * ```
 */
export const Dialog = ({
  children,
  language,
  title,
  text,
  open,
  onAgreed,
  onCancel,
  cancelEnabled = true,
}: DialogProps) => {
  // Handle case where dialog is not open
  if (!open) {
    return null;
  }

  return (
    <MUIDialog
      open={open}
      keepMounted
      onClose={onCancel}
      aria-describedby="alert-dialog-slide-description"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id="alert-dialog-slide-description">
          {children}
          {text}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {cancelEnabled && (
          <Button onClick={onCancel}>
            {language === 'en' ? 'Cancel' : 'Cancelar'}
          </Button>
        )}
        <Button onClick={onAgreed}>
          {language === 'en' ? 'OK' : 'Aceptar'}
        </Button>
      </DialogActions>
    </MUIDialog>
  );
};
