import React, { ReactElement } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import { PaperCard, CountryField, StateField, CityField } from 'ui';
import { Country, State, City } from 'utils';
import Stand from 'classes/stand';
import { signal } from '@preact/signals-react';

const country = signal<Country>(Country.getInstance()).value;
const state = signal<State>(State.getInstance()).value;

type Props = {
  URLBase: string;
  language: 'en' | 'es';
  stand: Stand;
};

const CompanyAddressInput = ({
  URLBase,
  language,
  stand,
}: Props): ReactElement => {
  return (
    <PaperCard>
      <Typography variant="body1">Direccion de la empresa</Typography>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Grid container rowSpacing={2} columnSpacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <CountryField
            country={country.id}
            language={language}
            URLBase={URLBase}
            onChange={(value) => (country.id = value)}
          />
        </Grid>
        {country.id ? (
          <Grid item xs={12} sm={6} md={4}>
            <StateField
              language={language}
              URLBase={URLBase}
              country={country.id}
              state={state.id}
              onChange={(value) => (state.id = value)}
            />
          </Grid>
        ) : null}
        {state.id ? (
          <Grid item xs={12} sm={6} md={4}>
            <CityField
              language={language}
              URLBase={URLBase}
              state={state.id}
              city={stand.relationships.city.data.id}
              onChange={(value) => (stand.relationships.city.data.id = value)}
            />
          </Grid>
        ) : null}
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label="Calle y numero"
            variant="outlined"
            size="small"
            type="text"
            value={stand.attributes.address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.address = e.target.value)
            }
            disabled={false}
            sx={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label="Codigo postal"
            variant="outlined"
            size="small"
            type="tel"
            value={Number(stand.attributes.zip_code)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.zip_code = e.target.value)
            }
            disabled={false}
            sx={{ width: '100%' }}
          />
        </Grid>
      </Grid>
    </PaperCard>
  );
};

export default CompanyAddressInput;
