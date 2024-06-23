import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import { useReducer, FormEvent, useState } from 'react';
import PasswordField from '../password-field';
import { API } from '@repo/utils';
import type {
  APIPostCreationError,
  CreationErrorInput,
  Action,
} from '@repo/utils';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Link from 'next/link';
import { Divider } from '@mui/material';
import GenericImageInput from '../generic-image-input';

type State = {
  isLoading: boolean;
  username: string;
  password: string;
  repeatPassword: string;
  firstName: string;
  lastName: string;
  imgPicture: string;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  isLoading: false,
  username: '',
  password: '',
  repeatPassword: '',
  firstName: '',
  lastName: '',
  imgPicture: '',
  error: [],
};

const Reducer = (
  state: State = InitialState,
  action: Action<null, CreationErrorInput>
): State => {
  if (action.type === 'loading') {
    return {
      ...state,
      isLoading: true,
      error: [],
    };
  } else if (action.type === 'success') {
    return {
      ...state,
      username: '',
      password: '',
      repeatPassword: '',
      firstName: '',
      lastName: '',
      imgPicture: '',
      error: [],
      isLoading: false,
    };
  } else if (action.type === 'error' && action.error) {
    return {
      ...state,
      error: [],
      // error: APICreationErrorHandler(action.error),
      isLoading: false,
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      error: [],
      [action.name]: action.value,
    };
  }
  throw new Error('Invalid action');
};

type Props = {
  URLBase: string;
  callback: (data: any) => void;
};

const SignUpForm = ({ URLBase, callback }: Props) => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canSubmit = (): boolean => {
    return (
      state.username !== '' &&
      state.password !== '' &&
      state.password === state.repeatPassword
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'loading' });
    API.Register({
      URLBase,
      attributes: {
        username: state.username,
        email: state.username,
        password: state.password,
        first_name: state.firstName,
        last_name: state.lastName,
        img_picture: state.imgPicture,
      },
    })
      .then((data: any) => {
        dispatch({ type: 'success' });
        callback(data);
        setDialogOpen((_p) => true);
      })
      .catch((error) => {
        dispatch({
          type: 'error',
          error: error,
        });
      });
  };

  const handleCloseDialog = () => {
    setDialogOpen((_p) => false);
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      component="form"
      noValidate={false}
      autoComplete="on"
      onSubmit={handleSubmit}
      marginTop={4}
    >
      <Grid container columnSpacing={2} rowSpacing={2} maxWidth={600}>
        <Grid item xs={12} marginBottom={1}>
          <Typography variant="body1">Datos de acceso</Typography>
          <Typography variant="body2">(requerido)</Typography>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Email"
            variant="outlined"
            size="small"
            type="email"
            value={state.username}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'username',
                value: e.target.value,
              });
            }}
            disabled={state.isLoading}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <PasswordField
            label="Contraseña"
            name="password"
            value={state.password}
            onChange={(v: string) =>
              dispatch({
                type: 'input',
                name: 'password',
                value: v,
              })
            }
            disabled={state.isLoading}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <PasswordField
            label="Confirma tu contraseña"
            name="repeatPassword"
            value={state.repeatPassword}
            onChange={(v: string) =>
              dispatch({
                type: 'input',
                name: 'repeatPassword',
                value: v,
              })
            }
            disabled={state.isLoading}
          />
        </Grid>
        {state.password !== '' && state.password !== state.repeatPassword ? (
          <Grid item xs={12} marginTop={2}>
            <Stack sx={{ width: '100%' }} spacing={2}>
              <Alert severity="warning">Las contraseñas no coinciden.</Alert>
            </Stack>
          </Grid>
        ) : null}
        <Grid item xs={12} marginTop={2} marginBottom={2}>
          <Divider />
        </Grid>
        <Grid item xs={12}>
          <Typography variant="body1">Perfil de usuario</Typography>
          <Typography variant="body2">(opcional)</Typography>
        </Grid>
        <Grid
          item
          xs={12}
          display="flex"
          justifyContent="center"
          marginBottom={7}
        >
          <GenericImageInput
            label="Foto de perfil"
            language={'es'}
            onChange={(img: string) => {
              dispatch({
                type: 'input',
                name: 'imgPicture',
                value: img,
              });
            }}
            height={180}
            width={180}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Nombre"
            variant="outlined"
            size="small"
            type="text"
            value={state.firstName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'firstName',
                value: e.target.value,
              });
            }}
            disabled={state.isLoading}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Apellido"
            variant="outlined"
            size="small"
            type="text"
            value={state.lastName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'lastName',
                value: e.target.value,
              });
            }}
            disabled={state.isLoading}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid
          item
          xs={12}
          marginTop={1}
          sx={{
            display: 'flex',
            justifyContent: 'right',
          }}
        >
          <Button
            variant="contained"
            type="submit"
            size="small"
            disabled={state.isLoading || !canSubmit()}
          >
            Crear cuenta
          </Button>
        </Grid>
        {state.isLoading ? (
          <Grid item xs={12} marginTop={1}>
            <Box sx={{ width: '100%' }}>
              <LinearProgress />
            </Box>
          </Grid>
        ) : null}
        {state.error.length &&
        state.error[0] &&
        state.error[0].status === 400 &&
        state.error[0].pointer === 'email' &&
        state.error[0].code === 'unique' ? (
          <Grid item xs={12} marginTop={2}>
            <Stack sx={{ width: '100%' }} spacing={2}>
              <Alert severity="error">
                Error: este usuario parece ya estar registrado.
              </Alert>
              <Link href="/sign-in">
                <Alert severity="info">Puedes iniciar sesion aqui.</Alert>
              </Link>
              <Link href="/reset-password">
                <Alert severity="success">Restablece tu contraseña aqui.</Alert>
              </Link>
            </Stack>
          </Grid>
        ) : null}
      </Grid>
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          Cuenta de usuario creada exitosamente!
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Tu cuenta de usuario ha sido creada exitosamente, sin embargo, es
            necesario validar su correo electronico antes de continuar.
            <br />
            <br />
            Por favor, busca en tu correo electronico un mensaje de activacion y
            sigue las instrucciones, gracias!
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} autoFocus>
            Ok
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SignUpForm;
