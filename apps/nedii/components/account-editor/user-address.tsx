import { ReactElement, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import AddIcon from '@mui/icons-material/Add';
import HomeIcon from '@mui/icons-material/Home';
import ApartmentIcon from '@mui/icons-material/Apartment';
import WorkIcon from '@mui/icons-material/Work';
import Paper from '@mui/material/Paper';
import LinearProgress from '@mui/material/LinearProgress';
import MarkunreadMailboxIcon from '@mui/icons-material/MarkunreadMailbox';
import UserAddressForm from 'components/user-address-form';
import { MenuItemWithIcon } from '@repo/ui';
import { BaseUserAddress } from '@repo/utils';
import { Signal, signal } from '@preact-signals/safe-react';
import { user } from 'classes/user';

const addOrEditAddress: Signal<boolean> = signal(false);
const currentAddress: Signal<BaseUserAddress> = signal(new BaseUserAddress());
const isLoading: Signal<boolean> = signal(false);

interface Props {
  darkMode: boolean;
  URLBase: string;
}

const UserAddress = ({ darkMode, URLBase }: Props): ReactElement => {
  useEffect(() => {
    addOrEditAddress.value = false;
    isLoading.value = true;
    user.setDataFromLocalStorage();
    user.URLBase = URLBase;
    user.getUserAddressesFromAPI().finally(() => (isLoading.value = false));
  }, []);

  const onComplete = () => {
    addOrEditAddress.value = false;
    isLoading.value = true;
    user.getUserAddressesFromAPI().finally(() => (isLoading.value = false));
  };

  return (
    <Paper elevation={1}>
      <Box padding={1.5}>
        <Typography variant="body1">Direcciones de entrega</Typography>
        <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
          {addOrEditAddress.value ? (
            <Grid item xs={12}>
              <Box marginBottom={1}>
                <Divider />
              </Box>
              <Typography variant="caption">
                {currentAddress.value.id
                  ? `Editar direccion ${
                      currentAddress.value.attributes.alias ?? ''
                    }`
                  : 'Crear nueva direccion'}
              </Typography>
              <UserAddressForm
                darkMode={darkMode}
                address={currentAddress.value}
                onCancel={() => (addOrEditAddress.value = false)}
                onComplete={() => onComplete()}
              />
            </Grid>
          ) : (
            <>
              <Grid item xs={4} sm={3}>
                <MenuItemWithIcon
                  darkMode={darkMode}
                  icon={<AddIcon />}
                  label="Agregar direccion"
                  selected={false}
                  isLoading={isLoading.value}
                  onClick={() => {
                    currentAddress.value = new BaseUserAddress();
                    currentAddress.value.URLBase = user.URLBase;
                    currentAddress.value.access = user.access;
                    addOrEditAddress.value = true;
                  }}
                />
              </Grid>
              {user.addresses.map((i: BaseUserAddress) => {
                return (
                  <Grid item xs={4} sm={3} key={i.id}>
                    <MenuItemWithIcon
                      darkMode={darkMode}
                      icon={
                        i.attributes.address_type === 'house' ? (
                          <HomeIcon />
                        ) : i.attributes.address_type === 'apartment' ? (
                          <ApartmentIcon />
                        ) : i.attributes.address_type === 'work' ? (
                          <WorkIcon />
                        ) : (
                          <MarkunreadMailboxIcon />
                        )
                      }
                      label={i.attributes.alias}
                      selected={false}
                      isLoading={isLoading.value}
                      onClick={() => {
                        currentAddress.value = i;
                        addOrEditAddress.value = true;
                      }}
                    />
                  </Grid>
                );
              })}
              {isLoading.value ? (
                <Grid item xs={12}>
                  <Box sx={{ width: '100%' }}>
                    <LinearProgress />
                  </Box>
                </Grid>
              ) : null}
            </>
          )}
        </Grid>
      </Box>
    </Paper>
  );
};

export default UserAddress;
