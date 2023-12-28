import React, { ReactElement, useEffect } from 'react';
import { Signal, signal } from '@preact/signals-react';
import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import Button from '@mui/material/Button';
import StepLabel from '@mui/material/StepLabel';
import type { Languages } from 'utils';
import InformationForm from './information-form';
import GroupInput from 'components/group-input';
import CompanyImages from 'components/company-images';
// import {
//   InitialState,
//   Reducer,
// } from './add-company-reducer';
// import {stand} from 'classes/stand';
import Stand from 'classes/stand';
import { user } from 'classes/user';

const stand: Stand = Stand.getInstance();
const activeStep: Signal<number> = signal(0);

type Props = {
  URLBase: string;
  language: Languages;
  jwt: string;
};

const AddCompanies = ({ URLBase, language, jwt }: Props): ReactElement => {
  // const [state, dispatch] = useReducer(Reducer, InitialState);
  // const [activeStep, setActiveStep] = useState<number>(0);

  useEffect(() => {
    user.getNediiUserFromLocalStorage();
  });

  return (
    <>
      <Box marginTop={4}>
        <Stepper activeStep={activeStep.value}>
          <Step completed={false}>
            <StepLabel>Informacion</StepLabel>
          </Step>
          <Step completed={false}>
            <StepLabel>Expos</StepLabel>
          </Step>
          <Step completed={false}>
            <StepLabel>Galeria</StepLabel>
          </Step>
        </Stepper>
      </Box>
      {activeStep.value === 0 ? (
        <InformationForm
          URLBase={URLBase}
          language={language}
          jwt={jwt}
          // state={state}
          // onChange={(name, value) => {
          //   dispatch({
          //     type: 'input',
          //     name,
          //     value,
          //   });
          // }}
          stand={stand}
        />
      ) : null}
      {/* {
        activeStep.value === 1 ?
          <GroupInput
            URLBase={URLBase}
            onChange={(name, value) => {
              dispatch({
                type: 'input',
                name,
                value,
              });
            }} /> : null
      }
      {
        activeStep.value === 2 ?
          <CompanyImages
            URLBase={URLBase}
            onChange={(name, value) => {
              dispatch({
                type: 'input',
                name,
                value,
              });
            }} /> : null
      } */}
      <Box display="flex" justifyContent="end" marginTop={3} marginBottom={3}>
        {activeStep.value > 0 ? (
          <Button
            variant="contained"
            type="submit"
            size="small"
            disabled={false}
            onClick={() => (activeStep.value = activeStep.value - 1)}
          >
            Atras
          </Button>
        ) : null}
        {activeStep.value < 2 ? (
          <Button
            variant="contained"
            type="submit"
            size="small"
            disabled={false}
            onClick={() => (activeStep.value = activeStep.value + 1)}
            sx={{
              marginLeft: '15px',
            }}
          >
            Siguiente
          </Button>
        ) : null}
      </Box>
    </>
  );
};

export default AddCompanies;
