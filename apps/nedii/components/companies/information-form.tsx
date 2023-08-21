import React, {
  ReactElement,
} from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import {State} from './add-company-reducer';

import {WeekSchedule} from 'ui';
import CompanyBasicInformationInput from 'components/company-basic-information-input';
import CompanyAddressInput from 'components/company-address-input';
import CompanyIdentityInput from 'components/company-identity-input';
import BookingInputData from 'components/booking-input-data';



type Props = {
  URLBase: string;
  language: 'en' | 'es';
  jwt: string;
  state: State;
  onChange: (name: string, value: string | boolean | number) => void;
};

const InformationForm = ({
    URLBase,
    language,
    jwt,
    state,
    onChange
  }: Props): ReactElement => {
  return (
    <>
      <CompanyBasicInformationInput
        name={state.name}
        short_description={state.short_description}
        contact_email={state.contact_email}
        isLoading={state.isLoading}
        displayAdvancedOptions={true}
        advancedOptions={state.advancedOptions}
        onChange={(name: string,
            value: string | boolean | number) =>
          onChange(name, value)
        } />
      {
        state.advancedOptions ?
          <>
            <CompanyAddressInput
              URLBase={URLBase}
              language={language}
              country={state.country ?? 0}
              state={state.state ?? 0}
              city={state.city ?? 0}
              address={state.address ?? ''}
              zip_code={state.zip_code ?? ''}
              onChange={(name: string,
                  value: string | boolean | number) =>
                onChange(name, value)
              } />
            <CompanyIdentityInput
              slogan={state.slogan ?? ''}
              mission={state.mission ?? ''}
              vision={state.vision ?? ''}
              onChange={(name: string,
                  value: string | boolean | number) =>
                onChange(name, value)
              } />
            <WeekSchedule
              title='Horarios de la empresa'
              language='es'
              always_open={state.always_open}
              onChange={(name: string, value: string | boolean) =>
                onChange(name, value)
              } />
            <BookingInputData
              booking_active={state.booking_active ?? false}
              booking_fee={state.booking_fee ?? 0}
              booking_email={state.booking_email ?? ''}
              restaurant={state.restaurant}
              onChange={(name: string,
                  value: string | boolean | number) =>
                onChange(name, value)
              } />
          </> : null
      }
    </>
  );
}

export default InformationForm;
