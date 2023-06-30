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
  Action,
  API,
  APICreationErrorHandler,
} from 'utils';
import type {APIPostCreationError} from 'utils';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
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

const SignUpForm = ({
    URLBase,
    callback,
  }: Props) => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [dialogOpen, setDialogOpen] = useState(false);
    
  const canSubmit = (): boolean => {
    return state.username !== '' && state.password !== '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({type: 'loading'});
    API.Register({
        URLBase,
        attributes: {
          username: state.username,
          email: state.username,
          password: state.password
        }
      })
        .then((data: any) => {
          dispatch({type: 'success'});
          callback(data);
          setDialogOpen(_p => true);
        })
        .catch((error) => {
          dispatch({
            type: 'error',
            error: error
          });
        });
  }
  

  const handleCloseDialog = () => {
    setDialogOpen(_p => false);
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
            Crear cuenta
          </Button>
        </Grid>
        {
          state.error.length &&
          state.error[0].status === 400 &&
          state.error[0].pointer === 'email' &&
          state.error[0].code === 'unique' ?
            <Grid item xs={12} marginTop={2}>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Alert severity='error'>
                  Error: este usuario parece ya estar registrado.
                </Alert>
                <Alert severity='info'>
                  Puedes iniciar sesion <Link href='/sign-in'>aqui</Link>
                </Alert>
                <Alert severity='success'>
                  Restablecer tu contraseña <Link href='/reset-password'>aqui</Link>
                </Alert>
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
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        aria-labelledby='alert-dialog-title'
        aria-describedby='alert-dialog-description'>
        <DialogTitle id='alert-dialog-title'>
          Cuenta de usuario creada exitosamente!
        </DialogTitle>
        <DialogContent>
          <DialogContentText id='alert-dialog-description'>
            Su cuenta de usuario ha sido creada exitosamente, sin embargo
            es necesario validar su correo electronico antes de continuar.
            <br />
            <br />
            Por favor busque en su correo electronico un mensaje de activacion
            y siga las instrucciones, gracias!
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
}

export default SignUpForm;
