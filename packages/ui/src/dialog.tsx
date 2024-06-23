import React, { ReactElement } from 'react';
import MUIDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide from '@mui/material/Slide';
import { TransitionProps } from '@mui/material/transitions';
import Button from '@mui/material/Button';
import { Languages } from '@repo/utils';

type Props = {
  language: Languages;
  title: string;
  text: string;
  open: boolean;
  onAgreed: () => void;
  onCancel: () => void;
};

const Dialog = ({
  language,
  title,
  text,
  open,
  onAgreed,
  onCancel,
}: Props): ReactElement => {
  const Transition = React.forwardRef(function Transition(
    props: TransitionProps & {
      children: React.ReactElement<any, any>;
    },
    ref: React.Ref<unknown>
  ) {
    return <Slide direction="up" ref={ref} {...props} />;
  });

  return (
    <>
      {open ? (
        <MUIDialog
          open={open}
          TransitionComponent={Transition}
          keepMounted
          onClose={() => onCancel()}
          aria-describedby="alert-dialog-slide-description"
        >
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <DialogContentText id="alert-dialog-slide-description">
              {text}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => onCancel()}>
              {language === 'en' ? 'Cancel' : 'Cancelar'}
            </Button>
            <Button onClick={() => onAgreed()}>
              {language === 'en' ? 'OK' : 'Aceptar'}
            </Button>
          </DialogActions>
        </MUIDialog>
      ) : null}
    </>
  );
};

export default Dialog;
