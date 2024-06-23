import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import { Signal, signal } from '@preact/signals-react';
import { FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Link from 'next/link';
import type { APIPostCreationError } from '@repo/utils';
import PasswordField from '../password-field';
import { BaseUser } from '@repo/utils';

const user = signal<BaseUser>(BaseUser.getInstance()).value;
const isLoading: Signal<boolean> = signal(false);
const error: Signal<Array<APIPostCreationError>> = signal([]);

type Props = {
  callback: () => void;
};

const SignInForm = ({ callback }: Props) => {
  const canSubmit = (): boolean => {
    return user.attributes.email !== '' && user.attributes.password !== '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    isLoading.value = true;
    user
      .login()
      .then(() => callback())
      .catch((e) => (error.value = e))
      .finally(() => (isLoading.value = false));
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
        <Grid item xs={12} md={6}>
          <TextField
            label="Email"
            variant="outlined"
            size="small"
            type="email"
            value={user.attributes.email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (user.attributes.email = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <PasswordField
            value={user.attributes.password}
            onChange={(v: string) => (user.attributes.password = v)}
            disabled={isLoading.value}
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
            disabled={isLoading.value || !canSubmit()}
          >
            Acceder
          </Button>
        </Grid>
        {isLoading.value ? (
          <Grid item xs={12} marginTop={1}>
            <Box sx={{ width: '100%' }}>
              <LinearProgress />
            </Box>
          </Grid>
        ) : null}
        {!error.value.length ? (
          <Grid item xs={12} marginTop={2}>
            <Stack sx={{ width: '100%' }} spacing={2}>
              <Link href="/reset-password">
                <Alert severity="info">
                  Si no recuerdas tu contraseña, puedes restablecerla dando
                  click aqui.
                </Alert>
              </Link>
              <Link href="/sign-up">
                <Alert severity="success">
                  Puedes crear una cuenta gratis dando click aqui.
                </Alert>
              </Link>
            </Stack>
          </Grid>
        ) : null}
        {error.value.length &&
        error.value[0] &&
        Number(error.value[0].status) === 401 &&
        error.value[0].code === 'no_active_account' ? (
          <Grid item xs={12} marginTop={2}>
            <Stack sx={{ width: '100%' }} spacing={2}>
              <Alert severity="error">
                Error: Este correo electronico no esta registrado en la
                plataforma o el correo electronico y/o contraseña son
                incorrectos.
              </Alert>
              <Link href="/reset-password">
                <Alert severity="success">
                  Si tu correo electronico es correcto, pero no recuerdas tu
                  contraseña, puedes restablecerla dando click aqui.
                </Alert>
              </Link>
              <Link href="/sign-up">
                <Alert severity="success">
                  Puedes crear una cuenta gratis dando click aqui.
                </Alert>
              </Link>
            </Stack>
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
};

export default SignInForm;
