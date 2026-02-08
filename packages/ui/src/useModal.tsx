'use client';

import { ReactNode, useState } from 'react';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import Box from '@mui/material/Box';
import HorizontalDivisor from '@iguzman/ui/HorizontalDivisor';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import MUIModal from '@mui/material/Modal';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * Props for the modal component returned by the useModal hook.
 */
interface ModalComponentProps {
  /** The content to display inside the modal. */
  children: ReactNode | Array<ReactNode>;
  /** The title to display at the top of the modal. */
  title: string;
  /** Text for the OK button. If not provided, the button won't be displayed. */
  OKButtonText?: string;
  /** Callback function to execute when the OK button is clicked. */
  OKButtonCallback?: () => void;
  /** Text for the cancel button. If not provided, the button won't be displayed. */
  cancelButtonText?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Default text for the cancel button. */
const DEFAULT_CANCEL_BUTTON_TEXT = 'Cancel';

/** Default text for the OK button. */
const DEFAULT_OK_BUTTON_TEXT = 'OK';

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * A custom hook that provides a modal component and its state management.
 *
 * This hook returns a component that can be rendered to display a modal,
 * along with functions to control its visibility.
 *
 * @example
 * ```tsx
 * const { Component: ModalComponent, open, setOpen } = useModal();
 *
 * function MyComponent() {
 *   return (
 *     <>
 *       <button onClick={() => setOpen(true)}>Open Modal</button>
 *       <ModalComponent
 *         title="Example Modal"
 *         OKButtonText="Confirm"
 *         OKButtonCallback={() => console.log('Confirmed')}
 *         cancelButtonText="Close"
 *       >
 *         <p>Modal content goes here.</p>
 *       </ModalComponent>
 *     </>
 *   );
 * }
 * ```
 *
 * @returns An object containing the modal component and state management functions.
 */
const useModal = () => {
  const [open, setOpen] = useState<boolean>(false);

  /**
   * The modal component that can be rendered.
   * This component should be rendered within a JSX tree.
   */
  const Component = ({
    children,
    title,
    OKButtonText,
    OKButtonCallback,
    cancelButtonText,
  }: ModalComponentProps) => (
    <MUIModal
      open={open}
      onClose={() => setOpen(false)}
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100vh',
      }}
    >
      <Box width="100%" maxWidth={600} padding={2}>
        <Paper elevation={2}>
          <Box padding={1} display="flex" flexDirection="column">
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography variant="body1" fontWeight="bold">
                {title}
              </Typography>
              <IconButton
                aria-label="close"
                size="small"
                onClick={() => setOpen(false)}
                color="error"
                style={{
                  width: 35,
                  height: 35,
                  boxShadow: '0px 0px 5px rgba(13, 13, 13, 0.24)',
                }}
              >
                <CloseFullscreenIcon fontSize="small" />
              </IconButton>
            </Box>
            <HorizontalDivisor margin={1} />
            {children}
            {(OKButtonText || cancelButtonText) && (
              <Box display="flex" justifyContent="space-between">
                {cancelButtonText ? (
                  <Button
                    variant="contained"
                    type="submit"
                    size="small"
                    onClick={() => setOpen(false)}
                    sx={{
                      textTransform: 'initial',
                    }}
                    color="inherit"
                  >
                    {cancelButtonText}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    type="submit"
                    size="small"
                    onClick={() => setOpen(false)}
                    sx={{
                      textTransform: 'initial',
                    }}
                    color="inherit"
                  >
                    {DEFAULT_CANCEL_BUTTON_TEXT}
                  </Button>
                )}
                <Box flexGrow={1} />
                {OKButtonText ? (
                  <Button
                    variant="contained"
                    type="submit"
                    size="small"
                    onClick={() =>
                      OKButtonCallback !== undefined
                        ? OKButtonCallback()
                        : setOpen(false)
                    }
                    sx={{
                      textTransform: 'initial',
                    }}
                    color="success"
                  >
                    {OKButtonText}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    type="submit"
                    size="small"
                    onClick={() =>
                      OKButtonCallback !== undefined
                        ? OKButtonCallback()
                        : setOpen(false)
                    }
                    sx={{
                      textTransform: 'initial',
                    }}
                    color="success"
                  >
                    {DEFAULT_OK_BUTTON_TEXT}
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    </MUIModal>
  );

  return {
    Component,
    open,
    setOpen,
  };
};

export default useModal;
