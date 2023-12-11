import React, { ReactElement } from 'react';
import { WeekSchedule } from 'ui';
import CompanyBasicInformationInput from 'components/company-basic-information-input';
import CompanyAddressInput from 'components/company-address-input';
import CompanyIdentityInput from 'components/company-identity-input';
import BookingInputData from 'components/booking-input-data';
// import {State} from './add-company-reducer';
import Stand from 'classes/stand';
import { Country, State, City } from 'utils';
import { signal } from '@preact/signals-react';

type Props = {
  URLBase: string;
  language: 'en' | 'es';
  jwt: string;
  stand: Stand;
};

const advancedOptions = signal<boolean>(false);

const InformationForm = ({
  URLBase,
  language,
  jwt,
  stand,
}: Props): ReactElement => {
  return (
    <>
      <CompanyBasicInformationInput
        isLoading={false}
        displayAdvancedOptions={true}
        advancedOptions={advancedOptions.value}
        stand={stand}
        switchAdvancedOptions={(value: boolean) =>
          (advancedOptions.value = value)
        }
      />
      {/* {advancedOptions.value ? (
        <>
          <CompanyAddressInput
            URLBase={URLBase}
            language={language}
            stand={stand}
          />
          <CompanyIdentityInput stand={stand} />
          <WeekSchedule
            title="Horarios de la empresa"
            language="es"
            always_open={stand.attributes.always_open}
            onChange={(name: string, value: string | boolean) =>
              console.log(name, value)
            }
          />
          <BookingInputData stand={stand} />
        </>
      ) : null} */}
    </>
  );
};

export default InformationForm;
