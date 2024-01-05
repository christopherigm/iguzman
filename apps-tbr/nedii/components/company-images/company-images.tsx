import React, {
  useEffect,
  ReactElement,
  useState,
  useReducer,
} from 'react';
import { signal, computed } from "@preact/signals-react";
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import { PaperCard } from 'ui';
import {stand} from 'classes/stand';
// import Stand from 'classes/stand';

// const fullName = computed(() => stand.attributes.about);

type Props = {
  URLBase: string;
  onChange: (name: string, value: number) => void;
};

const CompanyImages = ({
    URLBase,
    onChange,
  }: Props): ReactElement => {

  

  return (
    <PaperCard>
      <Box
        display='flex'
        flexDirection='row'
        justifyContent='space-between'
        alignItems='center'>
        <Typography variant='body1' fontWeight={600}>
          Fotos para tu empresa {stand.attributes.order}
        </Typography>
        {/* {
          stand.attributes.restaurant ?
            <Typography variant='body1' fontWeight={600}>
              Es restaurante!
            </Typography> : null
        } */}
        <Button
          onClick={() => {
            // stand.attributes.name = stand.attributes.name + '>';
            // stand.attributes.restaurant = !stand.attributes.restaurant;
            // stand.attributes.monday_open = '5:00';
            // stand.attributes.web_link = 'https://hello.com';
            // stand.relationships.plan.data.attributes.name = 'Plan basico';
            // console.log(stand.humanReadableDate('created'));
            // console.log(stand.humanReadableDate('created', true));
            // console.log(stand.humanReadableDate('created', true, false));
            // console.log(stand.time12HoursFormat('created'));
            // console.log('monday:', stand.attributes.monday_open);
            // console.log('monday:', stand.attributes.monday_close);
            // console.log('web_link:', stand.attributes.web_link);
            // console.log('plan:', stand.relationships.plan.data.attributes.name);
            // console.log('stand:', stand);
            // stand.sayHello();
            stand.attributes.order += 1;
            stand.relationships.plan.data.id = 0;
            // console.log(JSON.stringify(stand.attributes));
          }}
          variant='contained'
          type='submit'
          size='small'>
          Agregar foto
        </Button>
      </Box>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
    </PaperCard>
  );
};

export default CompanyImages;
