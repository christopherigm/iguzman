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
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import {
  PasswordField,
  GenericImageInput,
} from 'ui';
import {
  GetLocalStorageData,
  APICreationErrorHandler,
  API,
  SetLocalStorageData,
} from 'utils';
import type {
  APIPostCreationError,
  CreationErrorInput,
  Action,
} from 'utils';
import type UserInterface from 'interfaces/user-interface';
import type {UserAttributesInterface} from 'interfaces/user-interface';
import {
  UserAttributesInitialState
} from 'interfaces/user-interface';

interface Attributes extends UserAttributesInterface {
  password?: string;
  currentPassword: string;
  newPassword: string;
  repeatPassword: string;
};

type State = {
  isLoading: boolean;
  id: number;
  attributes: Attributes;
  error: Array<APIPostCreationError>;
};

const AttributesInitialState: Attributes = {
  ...UserAttributesInitialState,
  currentPassword: '',
  newPassword: '',
  repeatPassword: '',
};

const InitialState: State = {
  isLoading: false,
  id: 0,
  attributes: AttributesInitialState,
  error: []
};

const Reducer = (state: State = InitialState, action: Action<null, CreationErrorInput>): State => {
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
    const attributes: Attributes = {
      ...state.attributes,
      password: '',
      newPassword: '',
      repeatPassword: '',
    };
    return {
      ...state,
      error: [],
      isLoading: false,
      attributes,
    };
  } else if (action.type === 'clearErrors') {
    return {
      ...state,
      error: [],
    };
  } else if (action.type === 'error' && action.error) {
    return {
      ...state,
      error: APICreationErrorHandler(action.error),
      isLoading: false,
    };
  } else if (action.type === 'input' && action.name) {
    const attributes: Attributes = {
      ...state.attributes,
      [action.name]: action.value,
    };
    return {
      ...state,
      error: [],
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
            id: u.id,
            attributes: {
              ...u.attributes,
              currentPassword: '',
              newPassword: '',
              repeatPassword: '',
            },
          }
        });
      }
    }
  }, [user]);

  const UpdateUserData = (attributes: Attributes) => {
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
      .catch((error) => dispatch({type: 'error', error}));
  };

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    dispatch({type: 'loading'});
    const attributes: Attributes = {...state.attributes};
    if (attributes.img_picture && attributes.img_picture.search('base64') < 0 ) {
      delete attributes.img_picture;
    }
    if (state.attributes.currentPassword &&
        state.attributes.newPassword &&
        state.attributes.repeatPassword) {
      API.Login({
        URLBase,
        attributes: {
          username: state.attributes.email,
          password: state.attributes.currentPassword
        }
      })
        .then(() => {
          attributes.password = state.attributes.newPassword;
          UpdateUserData(attributes);
        })
        .catch((error) => dispatch({type: 'error', error}));
    } else {
      UpdateUserData(attributes);
    }
  };

  return (
    <Paper elevation={1}>
      <Box 
        component='form'
        noValidate={false}
        autoComplete='on'
        onSubmit={handleSubmit}
        padding={1.5}>
        <Box
          width='100%'
          position='relative'>
          <GenericImageInput
            label='Foto de perfil'
            language={'es'}
            onChange={(img: string) => {
              dispatch({
                type: 'input',
                name: 'img_picture',
                value: img
              });
            }}
            height={280}
            width='100%'
            defaultValue={state.attributes.img_picture} />
        </Box>
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
              label='Comunicados' />
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
            name='currentPassword'
            value={state.attributes.currentPassword}
            onChange={(v: string) => dispatch({
              type: 'input',
              name: 'currentPassword',
              value: v
            })}
            disabled={state.isLoading} />
        </Box>
        <Box marginTop={2}>
          <PasswordField
            label='Nueva contraseña'
            name='newPassword'
            value={state.attributes.newPassword}
            onChange={(v: string) => dispatch({
              type: 'input',
              name: 'newPassword',
              value: v
            })}
            disabled={state.isLoading} />
        </Box>
        <Box marginTop={2}>
          <PasswordField
            label='Confirma tu contraseña'
            name='repeatPassword'
            value={state.attributes.repeatPassword}
            onChange={(v: string) => dispatch({
              type: 'input',
              name: 'repeatPassword',
              value: v
            })}
            disabled={state.isLoading} />
        </Box>
        {
          state.attributes.newPassword !== '' &&
          state.attributes.newPassword !== state.attributes.repeatPassword ?
            <Box marginTop={2}>
              <Grid item xs={12} marginTop={2}>
                <Stack sx={{ width: '100%' }} spacing={2}>
                  <Alert severity='warning'>
                    Las contraseñas no coinciden.
                  </Alert>
                </Stack>
              </Grid>
            </Box> : null
        }
        {
          state.error &&
          state.error.length &&
          state.error[0].status !== 200 ?
            <Box marginTop={2}>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Alert severity='error' onClose={() => dispatch({
                    type: 'clearErrors',
                  })}>
                  Error: La contraseña actual es incorrecta.
                </Alert>
              </Stack>
            </Box> : null
        }
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
