import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import {
  useReducer,
  FormEvent,
  useState,
} from 'react';
import PasswordField from '../password-field';
import {
  API,
  APICreationErrorHandler,
} from 'utils';
import type {
  APIPostCreationError,
  Action,
} from 'utils';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Link from 'next/link';


type State = {
  success: boolean;
  isLoading: boolean;
  password: string;
  repeatPassword: string;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  success: false,
  isLoading: false,
  password: '',
  repeatPassword: '',
  error: []
};

const Reducer = (state: State = InitialState, action: Action): State => {
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
      password: '',
      repeatPassword: '',
      error: [],
      isLoading: false,
    };
  } else if (action.type === 'error' && action.error) {
    return {
      ...state,
      success: false,
      error: APICreationErrorHandler(action.error),
      isLoading: false,
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};

type Props = {
  URLBase: string;
  token: string;
  callback: (data: any) => void;
}

const SetPasswordForm = ({
    URLBase,
    token,
    callback,
  }: Props) => {
  const [state, dispatch] = useReducer(Reducer, InitialState);

  const canSubmit = (): boolean => {
    return state.password !== '' && state.password === state.repeatPassword;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({type: 'loading'});
    API.SetPassword({
        URLBase,
        attributes: {
          token: token,
          password: state.password
        }
      })
        .then((data: any) => {
          dispatch({type: 'success'});
          callback(data);
        })
        .catch((error) => {
          if (error.length) {
            dispatch({
              type: 'error',
              error: error
            });
          } else {
            dispatch({
              type: 'error',
              error: [{
                status: 500,
                code: '',
                detail: '',
                pointer: ''
              }]
            });
          }
        });
  };

  return (
    <Box
      display='flex'
      justifyContent='center'
      component='form'
      noValidate={false}
      autoComplete='on'
      onSubmit={handleSubmit}
      marginTop={4}>
      <Grid container
        columnSpacing={2}
        rowSpacing={2}
        maxWidth={600}>
        <Grid item xs={12} md={6}>
          <PasswordField
            label='Nueva contraseña'
            name='password'
            value={state.password}
            onChange={(v: string) => dispatch({
              type: 'input',
              name: 'password',
              value: v
            })}
            disabled={state.isLoading} />
        </Grid>
        <Grid item xs={12} md={6}>
          <PasswordField
            label='Confirma tu contraseña'
            name='repeatPassword'
            value={state.repeatPassword}
            onChange={(v: string) => dispatch({
              type: 'input',
              name: 'repeatPassword',
              value: v
            })}
            disabled={state.isLoading} />
        </Grid>
        <Grid item
          xs={12}
          marginTop={1}
          sx={{
            display: 'flex',
            justifyContent: 'right'
          }}>
          <Button
            variant='contained'
            type='submit'
            size='small'
            disabled={state.isLoading || !canSubmit()}>
            Crear nueva contraseña
          </Button>
        </Grid>
        {
          state.success ?
            <Grid item xs={12} marginTop={2}>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Link href='/reset-password'>
                  <Alert severity='success'>
                    Tu contraseña ha sido cambiada correctamente! Ahora
                    puedes iniciar sesion dando click aqui.
                  </Alert>
                </Link>
              </Stack>
            </Grid> : null
        }
        {
          state.password !== '' && state.password !== state.repeatPassword ?
            <Grid item xs={12} marginTop={2}>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Alert severity='warning'>
                  Las contraseñas no coinciden.
                </Alert>
              </Stack>
            </Grid> : null
        }
        {
          state.error.length &&
          (state.error[0].status === 500 ||
            state.error[0].status === 404 ) ?
            <Grid item xs={12} marginTop={2}>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Alert severity='error'>
                  Error: el codigo para crear la nueva contraseña
                  es incorrecto o ha expirado, por favor
                  contacta al administrador de la plataforma.
                </Alert>
                <Link href='/reset-password'>
                  <Alert severity='success'>
                    Restablece tu contraseña de nuevo dando click aqui 
                    para obtener un nuevo codigo.
                  </Alert>
                </Link>
              </Stack>
            </Grid> : null
        }
        {
          state.isLoading ?
            <Grid item xs={12} marginTop={1}>
              <Box sx={{ width: '100%' }}>
                <LinearProgress />
              </Box>
            </Grid> : null
        }
      </Grid>
    </Box>
  );
}

export default SetPasswordForm;
