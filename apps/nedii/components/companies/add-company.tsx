import React, {
  ReactElement,
  useState,
  useReducer,
} from 'react';
import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import Button from '@mui/material/Button';
import StepLabel from '@mui/material/StepLabel';
import InformationForm from './information-form';

import {
  InitialState,
  Reducer,
} from './add-company-reducer';

type Props = {
  URLBase: string;
  language: 'en' | 'es';
  jwt: string;
};

const AddCompanies = ({
    URLBase,
    language,
    jwt,
  }: Props): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [activeStep, setActiveStep] = useState<number>(0);

  return (
    <>
      <Box marginTop={4}>
        <Stepper activeStep={activeStep}>
          <Step completed={false}>
            <StepLabel>Informacion</StepLabel>
          </Step>
          <Step completed={false} >
            <StepLabel>Expos</StepLabel>
          </Step>
          <Step completed={false}>
            <StepLabel>Galeria</StepLabel>
          </Step>
        </Stepper>
      </Box>
      {
        activeStep === 0 ?
          <InformationForm
            URLBase={URLBase}
            language={language}
            jwt={jwt}
            state={state}
            onChange={(name, value) => {
              dispatch({
                type: 'input',
                name,
                value,
              });
            }} /> : null
      }
      <Box
        display='flex'
        justifyContent='end'
        marginTop={3}
        marginBottom={3}>
        {
          activeStep > 0 ?
            <Button
              variant='contained'
              type='submit'
              size='small'
              disabled={false}
              onClick={() => setActiveStep(v => v - 1)}>
              Atras
            </Button> : null
        }
        {
          activeStep < 2 ?
            <Button
              variant='contained'
              type='submit'
              size='small'
              disabled={false}
              onClick={() => setActiveStep(v => v + 1)}
              sx={{
                marginLeft: '15px'
              }}>
              Siguiente
            </Button> : null
        }
      </Box>
    </>
  );
};

export default AddCompanies;
