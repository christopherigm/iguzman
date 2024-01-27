import { ReactElement, FormEvent, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { Signal, signal } from '@preact/signals-react';
import { PasswordField, GenericImageInput } from '@repo/ui';
import { user } from 'classes/user';
import LinearProgress from '@mui/material/LinearProgress';

const currentPassword: Signal<string> = signal('');
const newPassword: Signal<string> = signal('');
const repeatPassword: Signal<string> = signal('');
const isLoading: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const passwordComplete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');
const passwordError: Signal<string> = signal('');

type Props = {
  darkMode: boolean;
  URLBase: string;
};

const UserInfo = ({ darkMode = false, URLBase }: Props): ReactElement => {
  useEffect(() => {
    user.getNediiUserFromLocalStorage();
    user.URLBase = URLBase;
    newPassword.value = '';
    repeatPassword.value = '';
    currentPassword.value = '';
    isLoading.value = false;
    complete.value = false;
    passwordComplete.value = false;
    error.value = '';
    passwordError.value = '';
  }, [URLBase]);

  const UpdateUserData = () => {
    isLoading.value = true;
    user
      .updateNediiUserData()
      .then(() => {
        if (newPassword.value) {
          passwordComplete.value = true;
          setTimeout(() => (passwordComplete.value = false), 3000);
        } else {
          complete.value = true;
          setTimeout(() => (complete.value = false), 3000);
        }
        error.value = '';
      })
      .catch((e: any) => {
        complete.value = false;
        passwordComplete.value = false;
        error.value = String(e);
      })
      .finally(() => {
        isLoading.value = false;
        currentPassword.value = '';
        newPassword.value = '';
        repeatPassword.value = '';
      });
  };

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    isLoading.value = true;
    if (currentPassword.value && newPassword.value && repeatPassword.value) {
      user.attributes.password = currentPassword.value;
      user
        .login()
        .then(() => {
          user.attributes.password = newPassword.value;
          UpdateUserData();
        })
        .catch((e) => {
          isLoading.value = false;
          complete.value = false;
          passwordComplete.value = false;
          passwordError.value = String(e);
        });
    } else {
      UpdateUserData();
    }
  };

  const canUpdatePassword = (): boolean => {
    return newPassword.value &&
      repeatPassword.value &&
      currentPassword.value &&
      newPassword.value === repeatPassword.value
      ? true
      : false;
  };

  return (
    <Box
      component="form"
      noValidate={false}
      autoComplete="off"
      onSubmit={handleSubmit}
    >
      <Box width={280} margin="0 auto">
        <GenericImageInput
          label="Foto de perfil"
          language="es"
          onChange={(img: string) => (user.attributes.img_picture = img)}
          height={280}
          width="100%"
          defaultValue={user.attributes.img_picture}
        />
      </Box>
      <Box marginTop={2}></Box>
      <Paper elevation={1}>
        <Box padding={1.5}>
          <Typography variant="caption">Informacion basica</Typography>
          <Grid container rowSpacing={2} columnSpacing={2} marginTop={1}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nombre"
                variant="outlined"
                size="small"
                type="text"
                value={user.attributes.first_name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  (user.attributes.first_name = e.target.value)
                }
                disabled={isLoading.value}
                style={{ width: '100%' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Apellido(s)"
                variant="outlined"
                size="small"
                type="text"
                value={user.attributes.last_name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  (user.attributes.last_name = e.target.value)
                }
                disabled={isLoading.value}
                style={{ width: '100%' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Email"
                variant="outlined"
                size="small"
                type="text"
                value={user.attributes.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  (user.attributes.email = e.target.value)
                }
                disabled={isLoading.value}
                style={{ width: '100%' }}
              />
            </Grid>
          </Grid>
          <Box marginTop={3} marginBottom={2}>
            <Divider />
          </Box>
          <Typography variant="caption">
            Preferencias de comunicacion
          </Typography>

          <Grid container rowSpacing={2} columnSpacing={2} marginTop={0}>
            <Grid item xs={12} sm={6}>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      checked={user.attributes.promotions}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        (user.attributes.promotions = e.target.checked)
                      }
                    />
                  }
                  label="Promociones"
                  disabled={isLoading.value}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={user.attributes.newsletter}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        (user.attributes.newsletter = e.target.checked)
                      }
                    />
                  }
                  label="Comunicados"
                  disabled={isLoading.value}
                />
              </FormGroup>
            </Grid>
          </Grid>
          {complete.value ? (
            <>
              <Box marginTop={3} marginBottom={2}>
                <Divider />
              </Box>
              <Stack sx={{ width: '100%' }}>
                <Alert severity="success">Datos actualizados!</Alert>
              </Stack>
            </>
          ) : null}
          {isLoading.value && !canUpdatePassword() ? (
            <>
              <Box marginTop={2} marginBottom={2}>
                <Divider />
              </Box>
              <Box sx={{ width: '100%' }}>
                <LinearProgress />
              </Box>
            </>
          ) : null}
          <Box marginTop={2} marginBottom={2}>
            <Divider />
          </Box>
          <Box display="flex" justifyContent="end" width="100%">
            <Button
              variant="contained"
              type="submit"
              size="small"
              sx={{
                marginLeft: '20px',
                textTransform: 'initial',
              }}
              disabled={isLoading.value}
            >
              Guardar cambios
            </Button>
          </Box>
          <Box marginTop={2} marginBottom={2}>
            <Divider />
          </Box>
          <Typography variant="caption">Cambiar contraseña</Typography>
          <Grid container rowSpacing={2} columnSpacing={2} marginTop={1}>
            <Grid item xs={12} sm={6}>
              <PasswordField
                label="Nueva contraseña"
                name="newPassword"
                value={newPassword.value}
                onChange={(v: string) => (newPassword.value = v)}
                disabled={isLoading.value}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <PasswordField
                label="Confirma tu contraseña"
                name="repeatPassword"
                value={repeatPassword.value}
                onChange={(v: string) => (repeatPassword.value = v)}
                disabled={isLoading.value}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <PasswordField
                label="Contraseña actual"
                name="currentPassword"
                value={currentPassword.value}
                onChange={(v: string) => (currentPassword.value = v)}
                disabled={isLoading.value}
              />
            </Grid>
            {newPassword.value !== '' &&
            newPassword.value !== repeatPassword.value ? (
              <Grid item xs={12}>
                <Stack sx={{ width: '100%' }} spacing={2}>
                  <Alert severity="warning">
                    Las contraseñas no coinciden.
                  </Alert>
                </Stack>
              </Grid>
            ) : null}
          </Grid>
          {passwordComplete.value ? (
            <>
              <Box marginTop={3} marginBottom={2}>
                <Divider />
              </Box>
              <Stack sx={{ width: '100%' }}>
                <Alert severity="success">Contraseña actualizada!</Alert>
              </Stack>
            </>
          ) : null}
          {isLoading.value && canUpdatePassword() ? (
            <>
              <Box marginTop={2} marginBottom={2}>
                <Divider />
              </Box>
              <Box sx={{ width: '100%' }}>
                <LinearProgress />
              </Box>
            </>
          ) : null}
          <Box marginTop={2} marginBottom={2}>
            <Divider />
          </Box>
          <Box display="flex" justifyContent="end" width="100%" marginTop={2}>
            <Button
              variant="contained"
              type="submit"
              size="small"
              sx={{
                marginLeft: '20px',
                textTransform: 'initial',
              }}
              disabled={isLoading.value || !canUpdatePassword()}
            >
              Actualizar contraseña
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default UserInfo;
