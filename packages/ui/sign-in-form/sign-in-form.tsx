import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import {
  useReducer,
  FormEvent,
} from 'react';
import PasswordField from '../password-field';
import {
  Action,
  API,
  APICreationErrorHandler,
  SetLocalStorageData,
} from 'utils';
import type {
  JWTPayload,
  APIPostCreationError
} from 'utils';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Link from 'next/link';

type State = {
  isLoading: boolean;
  username: string;
  password: string;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  isLoading: false,
  username: '',
  password: '',
  error: []
};

const Reducer = (state: State = InitialState, action: Action): State => {
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
      error: [],
      isLoading: false,
    };
  } else if (action.type === 'error' && action.error) {
    return {
      ...state,
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
  callback: (data: any) => void;
}

const SignInForm = ({
    URLBase,
    callback,
  }: Props) => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
    
  const canSubmit = (): boolean => {
    return state.username !== '' && state.password !== '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({type: 'loading'});
    API.Login({
        URLBase,
        attributes: {
          username: state.username,
          password: state.password,
        }
      })
        .then((data: JWTPayload) => {
          SetLocalStorageData('jwt', JSON.stringify(data));
          return API.GetUser({
            URLBase,
            jwt: data.access,
            userID: data.user_id
          });
        })
        .then((data: any) => {
          dispatch({type: 'success'});
          callback(data);
        })
        .catch((error) => {
          dispatch({
            type: 'error',
            error: error
          });
        });
  }

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
          <TextField
            label='Email'
            variant='outlined'
            size='small'
            type='email'
            value={state.username}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'username',
                value: e.target.value
              });
            }}
            disabled={state.isLoading}
            style={{width: '100%'}} />
        </Grid>
        <Grid item xs={12} md={6}>
          <PasswordField
            value={state.password}
            onChange={dispatch}
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
            Acceder
          </Button>
        </Grid>
        {
          !state.error.length ?
            <Grid item xs={12} marginTop={2}>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Link href='/reset-password'>
                  <Alert severity='info'>
                    Si no recuerdas tu contraseña, puedes restablecerla dando click aqui.
                  </Alert>
                </Link>
                <Link href='/sign-up'>
                  <Alert severity='success'>
                    Puedes crear una cuenta gratis dando click aqui.
                  </Alert>
                </Link>
              </Stack>
            </Grid> : null
        }
        {
          state.error.length &&
          state.error[0].status === 401 &&
          state.error[0].pointer === 'data' &&
          state.error[0].code === 'no_active_account' ?
            <Grid item xs={12} marginTop={2}>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Alert severity='error'>
                  Error: Este correo electronico no esta registrado en la plataforma
                  o el correo electronico y/o contraseña son incorrectos.
                </Alert>
                <Link href='/reset-password'>
                  <Alert severity='success'>
                    Si tu correo electronico es correcto, pero no recuerdas tu contraseña,
                    puedes restablecerla dando click aqui.
                  </Alert>
                </Link>
                <Link href='/sign-up'>
                  <Alert severity='success'>
                    Puedes crear una cuenta gratis dando click aqui.
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

export default SignInForm;
