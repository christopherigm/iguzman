import React, {
  ReactElement,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import {
  PaperCard,
  CountryField,
  StateField,
  CityField,
} from 'ui';
import TextField from '@mui/material/TextField';

type Props = {
  URLBase: string;
  language: 'en' | 'es';
  country: number;
  state: number;
  city: number;
  address: string;
  zip_code: string;
  onChange: (name: string, value: string | boolean | number) => void;
};

const CompanyAddressInput = ({
  URLBase,
  language,
  country,
  state,
  city,
  address,
  zip_code,
  onChange,
}: Props): ReactElement => {
  return (
    <PaperCard>
      <Typography variant='body1'>
        Direccion de la empresa
      </Typography>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <CountryField
            country={country}
            language={language}
            URLBase={URLBase}
            onChange={(name, value) =>
              onChange(name, value)
            } />
        </Grid>
        {
          country ?
            <Grid item xs={12} sm={6} md={4}>
              <StateField
                language={language}
                URLBase={URLBase}
                country={country}
                state={state}
                onChange={(name, value) =>
                  onChange(name, value)
                } />
            </Grid> : null
        }
        {
          state ?
            <Grid item xs={12} sm={6} md={4}>
              <CityField
                language={language}
                URLBase={URLBase}
                state={state}
                city={city}
                onChange={(value) =>
                  onChange('city', value)
                } />
            </Grid> : null
        }
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label='Calle y numero'
            variant='outlined'
            size='small'
            type='text'
            value={address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange('address', e.target.value)
            }
            disabled={false}
            sx={{width: '100%'}} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label='Codigo postal'
            variant='outlined'
            size='small'
            type='tel'
            value={Number(zip_code)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange('zip_code', Number(e.target.value) || 0)
            }
            disabled={false}
            sx={{width: '100%'}} />
        </Grid>
      </Grid>
    </PaperCard>
  );
};

export default CompanyAddressInput;
