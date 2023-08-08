import React, {
  ReactElement,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import {PaperCard} from 'ui';

type Props = {
  booking_active: boolean;
  booking_fee: number;
  booking_email: string;
  restaurant: boolean;
  onChange: (name: string, value: string | boolean | number) => void;
};

const BookingInputData = ({
    booking_active,
    booking_fee,
    booking_email,
    restaurant,
    onChange,
  }: Props): ReactElement => {
  return (
    <PaperCard>
      <Typography variant='body1'>
        Reservaciones
      </Typography>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  value={booking_active}
                  onChange={
                    (e: React.ChangeEvent<HTMLInputElement>) =>
                      onChange('booking_active', e.target.checked)
                    } />
              }
              label='La empresa acepta reservaciones?' />
          </FormGroup>
        </Grid>
        {
          booking_active ?
          <>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label='Costo de la reservacion'
                variant='outlined'
                size='small'
                type='tel'
                value={booking_fee}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange('booking_fee', Number(e.target.value))
                }
                disabled={false}
                sx={{width: '100%'}} />
            </Grid>
            <Grid item xs={12} sm={12} md={6}>
              <TextField
                label='Correo electronico para enviar informacion de la reservacion'
                variant='outlined'
                size='small'
                type='text'
                value={booking_email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange('booking_email', e.target.value)
                }
                disabled={false}
                sx={{width: '100%'}} />
            </Grid>
          </> : null
        }
        <Grid item xs={12} sm={6}>
          <FormGroup>
            <FormControlLabel
              disabled={false}
              control={
                <Switch
                  checked={restaurant}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                    onChange('restaurant', e.target.checked)
                  } />
              }
              label='La empresa es un restaurante?' />
          </FormGroup>
        </Grid>
      </Grid>
    </PaperCard>
  );
};

export default BookingInputData;
