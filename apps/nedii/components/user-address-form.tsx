import { ReactElement, FormEvent, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { GetIconByName, MenuItemWithIcon } from '@repo/ui';
import { BaseUserAddress } from '@repo/utils';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';

const isLoading: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  darkMode: boolean;
  address: BaseUserAddress;
  onCancel: () => void;
  onComplete: () => void;
};

const UserAddressForm = ({
  darkMode = false,
  address,
  onCancel,
  onComplete,
}: Props): ReactElement => {
  address.language = 'es';

  useEffect(() => {
    isLoading.value = false;
    complete.value = false;
    error.value = '';
  }, []);

  const canSubmit = (): boolean => {
    return true;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    isLoading.value = true;
    complete.value = false;
    error.value = '';
    if (address.id) {
      address
        .UpdateUserAddress()
        .then((i) => {
          complete.value = true;
          error.value = '';
        })
        .catch((e: any) => {
          error.value = String(e);
        })
        .finally(() => (isLoading.value = false));
    } else {
      address
        .CreateUserAddress()
        .then((i) => {
          complete.value = true;
          error.value = '';
        })
        .catch((e: any) => {
          error.value = String(e);
        })
        .finally(() => {
          isLoading.value = false;
          onComplete();
        });
    }
  };

  const onDelete = () => {
    isLoading.value = true;
    address.DeleteUserAddress().finally(() => {
      isLoading.value = false;
      onComplete();
    });
  };

  return (
    <Box
      component="form"
      noValidate={false}
      autoComplete="on"
      onSubmit={(e: FormEvent) => onSubmit(e)}
    >
      <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Nombre de la direccion"
            variant="outlined"
            size="small"
            type="text"
            value={address.attributes.alias}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (address.attributes.alias = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Nombre del receptor"
            variant="outlined"
            size="small"
            type="text"
            value={address.attributes.receptor_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (address.attributes.receptor_name = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Telefono"
            variant="outlined"
            size="small"
            type="tel"
            value={address.attributes.phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (address.attributes.phone = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Nombre de la calle"
            variant="outlined"
            size="small"
            type="text"
            value={address.attributes.street}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (address.attributes.street = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={6} sm={4}>
          <TextField
            label="Numero exterior"
            variant="outlined"
            size="small"
            type="text"
            value={address.attributes.ext_number}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (address.attributes.ext_number = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={6} sm={4}>
          <TextField
            label="Numero interior"
            variant="outlined"
            size="small"
            type="text"
            value={address.attributes.int_number}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (address.attributes.int_number = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={6} sm={4}>
          <TextField
            label="Codigo postal"
            variant="outlined"
            size="small"
            type="tel"
            value={address.attributes.zip_code}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (address.attributes.zip_code = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12}></Grid>
        <Grid item xs={12}>
          <TextField
            label="Referencias"
            variant="outlined"
            size="small"
            type="text"
            value={address.attributes.reference}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (address.attributes.reference = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12}>
          <Box>
            <Divider />
          </Box>
        </Grid>
        <Grid item xs={12}>
          <Typography variant="caption">Tipo de direccion</Typography>
        </Grid>
        <Grid item xs={12}>
          <Grid container columnSpacing={2} rowSpacing={2}>
            {address.addressTypeItems.map(({ slug, icon, label, selected }) => {
              return (
                <Grid item xs={6} sm={3} key={label}>
                  <MenuItemWithIcon
                    darkMode={darkMode}
                    label={label}
                    icon={GetIconByName({
                      name: icon,
                      color: selected ? '#2196f3' : '#777',
                    })}
                    selected={selected}
                    isLoading={isLoading.value}
                    onClick={() => address.updateAddressTypeSelected(slug)}
                  />
                </Grid>
              );
            })}
          </Grid>
        </Grid>
        {complete.value ? (
          <>
            <Grid item xs={12}>
              <Box>
                <Divider />
              </Box>
            </Grid>
            <Grid item xs={12}>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Alert severity="success">
                  Direccion "{address.attributes.alias}"{' '}
                  {address.id ? 'actualizada' : 'creada'}
                </Alert>
              </Stack>
            </Grid>
          </>
        ) : null}
        <Grid item xs={12}>
          <Box>
            <Divider />
          </Box>
        </Grid>
        <Grid
          item
          xs={12}
          sx={{
            display: 'flex',
            justifyContent: 'right',
          }}
        >
          <Button
            variant="contained"
            size="small"
            disabled={isLoading.value || !canSubmit()}
            onClick={() => onCancel()}
            color="inherit"
            sx={{ textTransform: 'initial' }}
          >
            {complete.value ? 'Regresar' : 'Cancelar'}
          </Button>
          {address.id ? (
            <Button
              variant="contained"
              size="small"
              disabled={isLoading.value || !canSubmit()}
              onClick={() => onDelete()}
              color="error"
              sx={{
                marginLeft: '15px',
                textTransform: 'initial',
              }}
            >
              Eliminar
            </Button>
          ) : null}
          <Button
            variant="contained"
            type="submit"
            size="small"
            disabled={isLoading.value || !canSubmit()}
            sx={{
              marginLeft: '15px',
              textTransform: 'initial',
            }}
          >
            {address.id ? 'Actualizar' : 'Agregar'} direccion
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
};

export default UserAddressForm;
