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
import Stand from 'classes/stand';
import { PaperCard, CountryField, StateField, CityField } from '@repo/ui';
import { Country, State, City } from '@repo/utils';

const country = signal<Country>(Country.getInstance()).value;
const state = signal<State>(State.getInstance()).value;

const isLoading: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  darkMode: boolean;
  URLBase: string;
  stand: Stand;
  onCancel: () => void;
  onIncomplete: () => void;
  onComplete: () => void;
};

const CompanyFormContactInfo = ({
  darkMode = false,
  URLBase,
  stand,
  onCancel,
  onIncomplete,
  onComplete,
}: Props): ReactElement => {
  useEffect(() => {
    console.log('CompanyFormContactInfo.tsx > renders');
    isLoading.value = false;
    complete.value = false;
    error.value = '';
    // country.id = 0;
  }, []);

  const canSubmit = (): boolean => {
    return true;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    isLoading.value = true;
    complete.value = false;
    error.value = '';
  };

  const checkCompleteness = (): void => {
    if (
      stand.relationships.city.data.id &&
      stand.attributes.address &&
      stand.attributes.zip_code &&
      stand.attributes.contact_email &&
      stand.relationships.phone
    ) {
      onComplete();
    } else {
      onIncomplete();
    }
  };

  return (
    <Box
      component="form"
      noValidate={false}
      autoComplete="on"
      onSubmit={(e: FormEvent) => onSubmit(e)}
    >
      <Typography variant="body1">
        Informacion de contacto de la empresa
      </Typography>
      <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <CountryField
            country={country.id}
            language="es"
            URLBase={URLBase}
            onChange={(value) => {
              country.id = value;
              state.id = 0;
              stand.relationships.city.data.id = 0;
            }}
          />
        </Grid>
        {country.id ? (
          <Grid item xs={12} sm={6} md={4}>
            <StateField
              country={country.id}
              language="es"
              URLBase={URLBase}
              state={state.id}
              onChange={(value) => {
                state.id = value;
                stand.relationships.city.data.id = 0;
              }}
            />
          </Grid>
        ) : null}
        {state.id ? (
          <Grid item xs={12} sm={6} md={4}>
            <CityField
              state={state.id}
              language="es"
              URLBase={URLBase}
              city={stand.relationships.city.data.id}
              onChange={(value) => {
                stand.relationships.city.data.id = value;
                checkCompleteness();
              }}
            />
          </Grid>
        ) : null}

        <Grid item xs={12} sm={8}>
          <TextField
            label="Direccion de la empresa"
            variant="outlined"
            size="small"
            type="text"
            name="address"
            value={stand.attributes.address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.address = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={6} sm={4}>
          <TextField
            label="Codigo postal"
            variant="outlined"
            size="small"
            type="number"
            name="zipcode"
            value={stand.attributes.zip_code}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.zip_code = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Correo electronico de contacto"
            variant="outlined"
            size="small"
            type="email"
            name="contact-email"
            value={stand.attributes.contact_email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.attributes.contact_email = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Correo electronico de soporte"
            variant="outlined"
            size="small"
            type="email"
            name="support-email"
            value={stand.attributes.support_email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.support_email = e.target.value)
            }
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={6} sm={4}>
          <TextField
            label="Telefono de la empresa"
            variant="outlined"
            size="small"
            type="tel"
            name="phone"
            value={stand.relationships.phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              stand.relationships.phone = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading.value}
            style={{ width: '100%' }}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default CompanyFormContactInfo;
