import { ReactElement, FormEvent, useEffect } from 'react';
import { user } from 'classes/user';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { Signal, signal } from '@preact-signals/safe-react';
import Stand from 'classes/stand';
import { CountryField, StateField, CityField } from '@repo/ui';
import { Country, State, City } from '@repo/utils';
import StandPhone from 'classes/stand/stand-phone';
import PhonesForm from 'components/companies/phones-form';

// const country = signal<Country>(Country.getInstance()).value;
// const defaultCountry = signal<Country>(Country.getInstance()).value;
// const state = signal<State>(State.getInstance()).value;
// const defaultState = signal<State>(State.getInstance()).value;
// const defaultCity = signal<City>(City.getInstance()).value;

const isLoadingLocal: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');
const phones: Signal<Array<StandPhone>> = signal([]);

type Props = {
  isLoading: boolean;
  darkMode: boolean;
  URLBase: string;
  stand: Stand;
  onCancel: () => void;
  onIncomplete: () => void;
  onComplete: () => void;
};

const CompanyFormContactInfo = ({
  isLoading = false,
  darkMode = false,
  URLBase,
  stand,
  onCancel,
  onIncomplete,
  onComplete,
}: Props): ReactElement => {
  useEffect(() => {
    console.log('CompanyFormContactInfo.tsx > renders');
    isLoadingLocal.value = false;
    complete.value = false;
    error.value = '';
    phones.value = [...stand.relationships.phones.data];
    user.setDataFromLocalStorage();
    user.URLBase = URLBase;
    // if (stand.relationships.city.data.id) {
    //   defaultCity.id = stand.relationships.city.data.id;
    //   if (stand.relationships.city.data.relationships?.state?.data?.id) {
    //     defaultState.id =
    //       stand.relationships.city.data.relationships.state.data.id;
    //     if (
    //       stand.relationships.city.data.relationships.state.data.relationships
    //         ?.country?.data?.id
    //     ) {
    //       defaultCountry.id =
    //         stand.relationships.city.data.relationships.state.data.relationships.country.data.id;
    //     }
    //   }
    // }
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    isLoadingLocal.value = true;
    complete.value = false;
    error.value = '';
  };

  const checkCompleteness = (): void => {
    if (
      stand.relationships.city.data.id &&
      stand.attributes.address &&
      stand.attributes.zip_code &&
      stand.attributes.contact_email &&
      stand.relationships.phones.data.length
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
            value={
              stand.relationships.city.data.relationships.state.data
                .relationships.country.data.id
            }
            language="es"
            URLBase={URLBase}
            onChange={(value) => {
              stand.relationships.city.data.relationships.state.data.relationships.country.data.id =
                Number(value);
              stand.relationships.city.data.relationships.state.data.id = 0;
              stand.relationships.city.data.id = 0;
            }}
          />
        </Grid>
        {stand.relationships.city.data.relationships.state.data.relationships
          .country.data.id ? (
          <Grid item xs={12} sm={6} md={4}>
            <StateField
              dependentID={
                stand.relationships.city.data.relationships.state.data
                  .relationships.country.data.id
              }
              language="es"
              URLBase={URLBase}
              value={stand.relationships.city.data.relationships.state.data.id}
              onChange={(value) => {
                stand.relationships.city.data.relationships.state.data.id =
                  Number(value);
              }}
            />
          </Grid>
        ) : null}
        {stand.relationships.city.data.relationships.state.data.id ? (
          <Grid item xs={12} sm={6} md={4}>
            <CityField
              dependentID={
                stand.relationships.city.data.relationships.state.data.id
              }
              language="es"
              URLBase={URLBase}
              value={stand.relationships.city.data.id}
              onChange={(value) => {
                stand.relationships.city.data.id = Number(value);
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
            disabled={isLoading || isLoadingLocal.value}
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
            disabled={isLoading || isLoadingLocal.value}
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
            disabled={isLoading || isLoadingLocal.value}
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
            disabled={isLoading || isLoadingLocal.value}
            style={{ width: '100%' }}
          />
        </Grid>
        {stand.id ? (
          <Grid item xs={12}>
            <PhonesForm
              isLoading={isLoadingLocal.value}
              phones={phones.value}
              standId={stand.id}
              URLBase={URLBase}
              access={user.access}
              onChnage={(): void => {
                isLoadingLocal.value = true;
                phones.value = [...phones.value];
                stand.relationships.phones.data = [...phones.value];
                stand
                  .save()
                  .catch((e) => {})
                  .finally(() => (isLoadingLocal.value = false));
              }}
            />
          </Grid>
        ) : null}
      </Grid>
    </Box>
  );
};

export default CompanyFormContactInfo;
