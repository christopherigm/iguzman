import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import { FormEvent } from 'react';
import PasswordField from '../password-field';
import {
  CommonLoginState,
  VoidCallback,
  Action
} from 'utils';

type Props = {
  handleSubmit: VoidCallback<FormEvent>;
  state: CommonLoginState,
  dispatch: VoidCallback<Action>
}

const LoginForm = ({
    handleSubmit,
    state,
    dispatch
  }: Props) => {
    
  const canSubmit = (): boolean => {
    return state.username !== '' && state.password !== '';
  };

  return (
    <Container maxWidth='sm'>
      <Box
        component='form'
        noValidate={false}
        autoComplete='on'
        onSubmit={handleSubmit}>
        <Grid container columnSpacing={2} rowSpacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              label='Username'
              variant='outlined'
              size='small'
              value={state.username}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'username',
                  value: e.target.value
                });
              }}
              disabled={state.login}
              style={{width: '100%'}} />
          </Grid>
          <Grid item xs={12} md={6}>
            <PasswordField
              value={state.password}
              onChange={dispatch}
              disabled={state.login} />
          </Grid>
          <Grid item xs={12} sx={{ display: 'flex' }}>
            <Typography sx={{ flexGrow: 1 }}></Typography>
            <Button
              variant='contained'
              type='submit'
              size='small'
              disabled={state.login || !canSubmit()}>
              Login
            </Button>
          </Grid>
          {
            state.login ?
              <Grid item xs={12} sx={{ display: 'flex' }} justifyContent='center'>
                <CircularProgress />
              </Grid> : null
          }
        </Grid>
      </Box>
    </Container>
  );
}

export default LoginForm;
