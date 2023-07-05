import React, {
  ReactElement,
  useState,
  FormEvent,
  useReducer,
  useEffect,
} from 'react';
import Head from 'next/head';
import {
  API,
  GetCookieCachedValues,
  GetEnvVariables,
  GetLocalStorageData,
  APICreationErrorHandler,
} from 'utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages,
  APIPostCreationError,
  Action,
} from 'utils';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Container from '@mui/material/Container';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Link from 'next/link';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import MainLayout from 'layouts/main-layout';
import {SystemInitalState} from 'interfaces/system-interface';
import type System from 'interfaces/system-interface';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ContactMailIcon from '@mui/icons-material/ContactMail';
import FavoriteIcon from '@mui/icons-material/Favorite';
import StoreIcon from '@mui/icons-material/Store';
import PaymentIcon from '@mui/icons-material/Payment';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Avatar from '@mui/material/Avatar';
import {PasswordField} from 'ui';
import type UserInterface from 'interfaces/user-interface';
import UserAddress from './user-address';
import { JWTPayload } from 'utils';

type State = {
  isLoading: boolean;
  username: string;
  email: string;
  currentPassword: string;
  password: string;
  repeatPassword: string;
  firstName: string;
  lastName: string;
  imgPicture: string;
  newsletter: boolean;
  promotions: boolean;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  isLoading: false,
  username: '',
  email: '',
  currentPassword: '',
  password: '',
  repeatPassword: '',
  firstName: '',
  lastName: '',
  imgPicture: '',
  newsletter: false,
  promotions: false,
  error: []
};

const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'setState') {
    return {
      ...state,
      ...action.state
    };
  } else if (action.type === 'loading') {
    return {
      ...state,
      isLoading: true,
      error: [],
    };
  } else if (action.type === 'success') {
    return {
      ...state,
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


interface Props {
  darkMode: boolean;
  URLBase: string;
}

const AccountEditorForm = ({
    darkMode,
    URLBase,
  }: Props): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [user, setUser] = useState<UserInterface | null>(null);
  const [jwt, setJWT] = useState<JWTPayload | null>(null);

  useEffect(() => {
    if (!user) {
      const u = GetLocalStorageData('user');
      if (u) {
        setUser( _p => JSON.parse(u) as UserInterface);
        const user = JSON.parse(u) as UserInterface;
        dispatch({
          type: 'setState',
          state: {
            username: user.attributes.username,
            email: user.attributes.email,
            firstName: user.attributes.first_name,
            lastName: user.attributes.last_name,
            imgPicture: user.attributes.img_picture,
          }
        });
      }
    }
    if (!jwt) {
      const cachedJWT = GetLocalStorageData('jwt');
      if (cachedJWT) {
        setJWT(_p => JSON.parse(cachedJWT) as JWTPayload);
      }
    }
  }, [user, jwt]);

  return (
    <>
    {
      state.username ?
        <Grid container
          marginTop={1}
          columnSpacing={2}
          rowSpacing={2}>
          <Grid item
            xs={12}
            sm={6}
            md={4}
            marginBottom={2}>
            <Paper elevation={1}>
            <Box padding={1.5}>
                  <Typography variant='caption'>
                    Foto de perfil
                  </Typography>
                  <Box
                    width='100%'
                    height={280}
                    position='relative'
                    overflow='hidden'>
                    <Avatar
                      alt='Profile pictre'
                      src={state.imgPicture}
                      variant='rounded'
                      sx={{
                        width: '100%',
                        height: '280px'
                      }} />
                    <Box
                      position='absolute'
                      top={0}
                      left={0}>
                      <input
                        type='file'
                        id='user-image'
                        onChange={(e: any) => {
                          const file = e.target.files[0];
                          const reader = new FileReader();
                          reader.onload = (e: any) => {
                            dispatch({
                              type: 'input',
                              name: 'imgPicture',
                              value: e.target.result
                            });
                          };
                          if (file) {
                            reader.readAsDataURL(file);
                          }
                        }}
                        accept='image/*'
                        style={{
                          width: '700px',
                          height: '280px',
                          cursor: 'pointer',
                          opacity: 0
                        }} />
                    </Box>
                  </Box>
                  <Typography variant='caption'>
                    (Click en la foto para cambiarla)
                  </Typography>
                  <Box
                    marginTop={2}
                    marginBottom={2}>
                    <Divider />
                  </Box>
                  <Box marginTop={3}>
                    <TextField
                      label='Nombre'
                      variant='outlined'
                      size='small'
                      type='text'
                      value={state.firstName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        dispatch({
                          type: 'input',
                          name: 'firstName',
                          value: e.target.value
                        });
                      }}
                      disabled={state.isLoading}
                      style={{width: '100%'}}/>
                  </Box>
                  <Box marginTop={3}>
                    <TextField
                      label='Apellido(s)'
                      variant='outlined'
                      size='small'
                      type='text'
                      value={state.lastName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        dispatch({
                          type: 'input',
                          name: 'lastName',
                          value: e.target.value
                        });
                      }}
                      disabled={state.isLoading}
                      style={{width: '100%'}}/>
                  </Box>
                  <Box marginTop={3}>
                    <TextField
                      label='Email'
                      variant='outlined'
                      size='small'
                      type='text'
                      value={state.email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        dispatch({
                          type: 'input',
                          name: 'email',
                          value: e.target.value
                        });
                      }}
                      disabled={state.isLoading}
                      style={{width: '100%'}}/>
                  </Box>
                  <Box
                    marginTop={3}
                    marginBottom={1}>
                    <Divider />
                  </Box>
                  <Typography variant='caption'>
                    Preferencias de comunicacion
                  </Typography>
                  <Box marginTop={1}>
                    <FormGroup>
                      <FormControlLabel control={<Switch checked={state.promotions} />} label='Promociones' />
                      <FormControlLabel control={<Switch checked={state.newsletter} />} label='Comunicados' />
                    </FormGroup>
                  </Box>
                  <Box
                    marginTop={3}
                    marginBottom={1}>
                    <Divider />
                  </Box>
                  <Typography variant='caption'>
                    Cambiar contraseña
                  </Typography>
                  <Box marginTop={2}>
                    <PasswordField
                      label='Contraseña actual'
                      name='password'
                      value={state.currentPassword}
                      onChange={dispatch}
                      disabled={state.isLoading} />
                  </Box>
                  <Box marginTop={2}>
                    <PasswordField
                      label='Nueva contraseña'
                      name='newPassword'
                      value={state.password}
                      onChange={dispatch}
                      disabled={state.isLoading} />
                  </Box>
                  <Box marginTop={2}>
                    <PasswordField
                      label='Confirma tu contraseña'
                      name='repeatPassword'
                      value={state.repeatPassword}
                      onChange={dispatch}
                      disabled={state.isLoading} />
                  </Box>
            </Box>
            </Paper>
          </Grid>
          <Grid item
            xs={12}
            sm={6}
            md={8}
            marginBottom={2}>
            {
              user && jwt ?
                <Box>
                <Paper elevation={1}>
                <Box padding={1.5}>
                  <Typography variant='body2'>
                    Direcciones de entrega
                  </Typography>
                  <UserAddress
                    darkMode={darkMode}
                    userID={Number(user.id)}
                    URLBase={URLBase}
                    jwt={jwt.access} />
                </Box>
                </Paper>
                </Box> : null
            }
            <Box marginTop={3}>
            <Paper elevation={1}>
            <Box padding={1.5}>
              <Typography variant='body2'>
                Formas de pago
              </Typography>
            </Box>
            </Paper>
            </Box>
          </Grid>
        </Grid> : null
    }
    </>
    
  );
};

export default AccountEditorForm;
