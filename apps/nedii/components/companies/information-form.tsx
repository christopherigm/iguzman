import React, {
  ReactElement,
} from 'react';
import {WeekSchedule} from 'ui';
import CompanyBasicInformationInput from 'components/company-basic-information-input';
import CompanyAddressInput from 'components/company-address-input';
import CompanyIdentityInput from 'components/company-identity-input';
import BookingInputData from 'components/booking-input-data';
import {State} from './add-company-reducer';
import Stand from 'classes/stand';
import { signal } from '@preact/signals-react';

type Props = {
  URLBase: string;
  language: 'en' | 'es';
  jwt: string;
  state: State;
  onChange: (name: string, value: string | boolean | number) => void;
  stand: Stand,
};

const advancedOptions = signal<boolean>(false);

const InformationForm = ({
    URLBase,
    language,
    jwt,
    state,
    onChange,
    stand,
  }: Props): ReactElement => {
  
  return (
    <>
      <CompanyBasicInformationInput
        isLoading={false}
        displayAdvancedOptions={true}
        advancedOptions={advancedOptions.value}
        stand={stand}
        switchAdvancedOptions={(value: boolean) => advancedOptions.value=value} />
      {
        advancedOptions.value ?
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
