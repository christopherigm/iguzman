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
import { PasswordField, GenericImageInput } from 'ui';
import type { APIPostCreationError } from 'utils';
import { user } from 'classes/user';

const currentPassword: Signal<string> = signal('');
const newPassword: Signal<string> = signal('');
const repeatPassword: Signal<string> = signal('');
const error: Signal<Array<APIPostCreationError>> = signal([]);

type Props = {
  darkMode: boolean;
  URLBase: string;
  isLoading: boolean;
  switchLoading: (v: boolean) => void;
};

const UserInfo = ({
  darkMode = false,
  URLBase,
  isLoading = false,
  switchLoading,
}: Props): ReactElement => {
  useEffect(() => {
    user.setDataFromLocalStorage();
    user.URLBase = URLBase;
  }, [URLBase]);

  const UpdateUserData = () => {
    switchLoading(true);
    user.updateUserData().finally(() => {
      switchLoading(false);
      currentPassword.value = '';
      newPassword.value = '';
      repeatPassword.value = '';
    });
  };

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    switchLoading(true);
    if (currentPassword.value && newPassword.value && repeatPassword.value) {
      user.attributes.password = currentPassword.value;
      user
        .login()
        .then(() => {
          user.attributes.password = newPassword.value;
          UpdateUserData();
        })
        .catch(() => switchLoading(false));
    } else {
      UpdateUserData();
    }
  };

  return (
    <Paper elevation={1}>
      <Box
        component="form"
        noValidate={false}
        autoComplete="off"
        onSubmit={handleSubmit}
        padding={1.5}
      >
        <Box width="100%" position="relative">
          <GenericImageInput
            label="Foto de perfil"
            language={'es'}
            onChange={(img: string) => (user.attributes.img_picture = img)}
            height={280}
            width="100%"
            defaultValue={user.attributes.img_picture}
          />
        </Box>
        <Box marginTop={2} marginBottom={2}>
          <Divider />
        </Box>
        <Box marginTop={3}>
          <TextField
            label="Nombre"
            variant="outlined"
            size="small"
            type="text"
            value={user.attributes.first_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (user.attributes.first_name = e.target.value)
            }
            disabled={isLoading}
            style={{ width: '100%' }}
          />
        </Box>
        <Box marginTop={3}>
          <TextField
            label="Apellido(s)"
            variant="outlined"
            size="small"
            type="text"
            value={user.attributes.last_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (user.attributes.last_name = e.target.value)
            }
            disabled={isLoading}
            style={{ width: '100%' }}
          />
        </Box>
        <Box marginTop={3}>
          <TextField
            label="Email"
            variant="outlined"
            size="small"
            type="text"
            value={user.attributes.email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (user.attributes.email = e.target.value)
            }
            disabled={isLoading}
            style={{ width: '100%' }}
          />
        </Box>
        <Box marginTop={3} marginBottom={1}>
          <Divider />
        </Box>
        <Typography variant="caption">Preferencias de comunicacion</Typography>
        <Box marginTop={1}>
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
              disabled={isLoading}
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
              disabled={isLoading}
            />
          </FormGroup>
        </Box>
        <Box marginTop={3} marginBottom={1}>
          <Divider />
        </Box>
        <Typography variant="caption">Cambiar contraseña</Typography>
        <Box marginTop={2}>
          <PasswordField
            label="Contraseña actual"
            name="currentPassword"
            value={currentPassword.value}
            onChange={(v: string) => (currentPassword.value = v)}
            disabled={isLoading}
          />
        </Box>
        <Box marginTop={2}>
          <PasswordField
            label="Nueva contraseña"
            name="newPassword"
            value={newPassword.value}
            onChange={(v: string) => (newPassword.value = v)}
            disabled={isLoading}
          />
        </Box>
        <Box marginTop={2}>
          <PasswordField
            label="Confirma tu contraseña"
            name="repeatPassword"
            value={repeatPassword.value}
            onChange={(v: string) => (repeatPassword.value = v)}
            disabled={isLoading}
          />
        </Box>
        {newPassword.value !== '' &&
        newPassword.value !== repeatPassword.value ? (
          <Box marginTop={2}>
            <Grid item xs={12} marginTop={2}>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Alert severity="warning">Las contraseñas no coinciden.</Alert>
              </Stack>
            </Grid>
          </Box>
        ) : null}
        {error.value && error.value.length && error.value[0].status !== 200 ? (
          <Box marginTop={2}>
            <Stack sx={{ width: '100%' }} spacing={2}>
              <Alert severity="error" onClose={() => (error.value = [])}>
                Error: La contraseña actual es incorrecta.
              </Alert>
            </Stack>
          </Box>
        ) : null}
        <Box display="flex" justifyContent="end" width="100%" marginTop={2}>
          <Button
            variant="contained"
            type="submit"
            size="small"
            sx={{
              marginLeft: '20px',
              textTransform: 'initial',
            }}
            disabled={isLoading}
          >
            Guardar cambios
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default UserInfo;
