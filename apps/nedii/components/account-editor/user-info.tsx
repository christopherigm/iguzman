import {
  ReactElement,
  FormEvent,
  useState,
  useReducer,
  useEffect,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Avatar from '@mui/material/Avatar';
import Paper from '@mui/material/Paper';
import {PasswordField} from 'ui';
import {
  GetLocalStorageData,
  APICreationErrorHandler,
  API,
  SetLocalStorageData,
} from 'utils';
import type {
  APIPostCreationError,
  Action,
} from 'utils';
import type UserInterface from 'interfaces/user-interface';
import type {UserAttributesInterface} from 'interfaces/user-interface';
import type { JWTPayload } from 'utils';
import {
  UserAttributesInitialState
} from 'interfaces/user-interface';

type State = {
  isLoading: boolean;
  id: number;
  attributes: UserAttributesInterface;
  currentPassword: string;
  newPassword: string;
  repeatPassword: string;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  isLoading: false,
  id: 0,
  attributes: UserAttributesInitialState,
  currentPassword: '',
  newPassword: '',
  repeatPassword: '',
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
    const attributes: UserAttributesInterface = {
      ...state.attributes,
      [action.name]: action.value,
    };
    return {
      ...state,
      attributes,
    };
  }
  throw new Error('Invalid action');
};

type Props = {
  darkMode: boolean;
  URLBase: string;
  jwt: string;
};

const UserInfo = ({
    darkMode=false,
    URLBase,
    jwt,
  }: Props): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [user, setUser] = useState<UserInterface | null>(null);

  useEffect(() => {
    if (!user) {
      const cachedUser: string | null = GetLocalStorageData('user');
      if (cachedUser) {
        const u: UserInterface = JSON.parse(cachedUser) as UserInterface;
        setUser(_p => u);
        dispatch({
          type: 'setState',
          state: {
            ...state,
            id: u.id,
            attributes: u.attributes,
          }
        })
      }
    }
  }, []);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const attributes = {...state.attributes};
    if (attributes.img_picture && attributes.img_picture.search('base64') < 0 ) {
      delete attributes.img_picture;
    }
    dispatch({type: 'loading'});
    API.UpdateUser({
      URLBase,
      jwt,
      id: user ? Number(user.id) : 0,
      attributes: attributes,
    })
      .then(() => API.GetUser({
        URLBase,
        userID: user ? Number(user.id) : 0,
        jwt,
      }))
      .then((user: UserInterface) => {
        SetLocalStorageData('user', JSON.stringify(user));
        dispatch({type: 'success'});
      })
      .catch((error) => {
        console.log('err', error);
        dispatch({type: 'error', error});
      });
  };

  return (
    <Paper elevation={1}>
      <Box 
        component='form'
        noValidate={false}
        autoComplete='on'
        onSubmit={handleSubmit}
        padding={1.5}>
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
                      src={state.attributes.img_picture}
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
                              name: 'img_picture',
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
                      value={state.attributes.first_name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        dispatch({
                          type: 'input',
                          name: 'first_name',
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
                      value={state.attributes.last_name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        dispatch({
                          type: 'input',
                          name: 'last_name',
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
                      value={state.attributes.email}
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
                      <FormControlLabel
                        disabled={state.isLoading}
                        control={
                          <Switch
                            checked={state.attributes.promotions}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              dispatch({
                                type: 'input',
                                name: 'promotions',
                                value: e.target.checked
                              });
                            }} />
                        }
                        label='Promociones' />
                      <FormControlLabel
                        disabled={state.isLoading}
                        control={
                          <Switch
                            checked={state.attributes.newsletter}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              dispatch({
                                type: 'input',
                                name: 'newsletter',
                                value: e.target.checked
                              });
                            }} />
                        }
                        label='Comunicadoss' />
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
                      value={state.newPassword}
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
                  <Box
                    display='flex'
                    justifyContent='end'
                    width='100%'
                    marginTop={2}>
                    <Button
                      variant='contained'
                      type='submit'
                      size='small'
                      disabled={state.isLoading}
                      sx={{
                        marginLeft: '20px',
                        textTransform: 'initial',
                      }}>
                      Guardar cambios
                    </Button>
                  </Box>
      </Box>
    </Paper>
  );
};

export default UserInfo;
