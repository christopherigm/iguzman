import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import { useReducer, FormEvent } from 'react';
import { API } from '@repo/utils';
import type {
  APIPostCreationError,
  CreationErrorInput,
  Action,
} from '@repo/utils';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Link from 'next/link';

type State = {
  success: boolean;
  isLoading: boolean;
  username: string;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  success: false,
  isLoading: false,
  username: '',
  error: [],
};

const Reducer = (
  state: State = InitialState,
  action: Action<null, CreationErrorInput>
): State => {
  if (action.type === 'loading') {
    return {
      ...state,
      success: false,
      isLoading: true,
      error: [],
    };
  } else if (action.type === 'success') {
    return {
      ...state,
      success: true,
      username: '',
      error: [],
      isLoading: false,
    };
  } else if (action.type === 'error' && action.error) {
    return {
      ...state,
      success: false,
      error: [],
      // error: APICreationErrorHandler(action.error),
      isLoading: false,
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value,
    };
  }
  throw new Error('Invalid action');
};

type Props = {
  URLBase: string;
  callback: (data: any) => void;
};

const ResetPasswordForm = ({ URLBase, callback }: Props) => {
  const [state, dispatch] = useReducer(Reducer, InitialState);

  const canSubmit = (): boolean => {
    return state.username !== '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'loading' });
    API.ResetPassword({
      URLBase,
      attributes: {
        email: state.username,
      },
    })
      .then((data: any) => {
        dispatch({ type: 'success' });
        callback(data);
      })
      .catch((error) => {
        dispatch({
          type: 'error',
          error: error,
        });
      });
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
        <Grid item xs={12}>
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
            Restablecer contraseña
          </Button>
        </Grid>
        {state.error &&
        state.error.length &&
        state.error[0] &&
        state.error[0].status === 404 ? (
          <Grid item xs={12} marginTop={2}>
            <Stack sx={{ width: '100%' }} spacing={2}>
              <Alert severity="error">
                Error: Este correo electronico no esta registrado en la
                plataforma o el correo electronico es incorrecto.
              </Alert>
              <Link href="/sign-up">
                <Alert severity="success">
                  Puedes crear una cuenta gratis dando click aqui.
                </Alert>
              </Link>
            </Stack>
          </Grid>
        ) : null}
        {state.success ? (
          <Grid item xs={12} marginTop={2}>
            <Stack sx={{ width: '100%' }} spacing={2}>
              <Alert severity="success">
                Se ha enviado un correo electronico para restablecer tu
                contraseña.
                <br />
                Por favor sigue las instrucciones para realizar esta accion.
              </Alert>
              <Alert severity="info">
                Si no recibiste el correo para restablecer tu contraseña
                contacta al administrador de la plataforma.
              </Alert>
            </Stack>
          </Grid>
        ) : null}
        {state.isLoading ? (
          <Grid item xs={12} marginTop={1}>
            <Box sx={{ width: '100%' }}>
              <LinearProgress />
            </Box>
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
};

export default ResetPasswordForm;
