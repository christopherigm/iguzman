import React, { ReactElement } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import { PaperCard } from 'ui';
import Stand from 'classes/stand';

type Props = {
  stand: Stand;
};

const BookingInputData = ({ stand }: Props): ReactElement => {
  return (
    <PaperCard>
      <Typography variant="body1">Reservaciones</Typography>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Grid container rowSpacing={2} columnSpacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  value={stand.attributes.booking_active}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    (stand.attributes.booking_active = e.target.checked)
                  }
                />
              }
              label="La empresa acepta reservaciones?"
            />
          </FormGroup>
        </Grid>
        {stand.attributes.booking_active ? (
          <>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                label="Costo de la reservacion"
                variant="outlined"
                size="small"
                type="tel"
                value={stand.attributes.booking_fee}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  (stand.attributes.booking_fee = Number(e.target.value))
                }
                disabled={false}
                sx={{ width: '100%' }}
              />
            </Grid>
            <Grid item xs={12} sm={12} md={6}>
              <TextField
                label="Correo electronico para enviar informacion de la reservacion"
                variant="outlined"
                size="small"
                type="text"
                value={stand.attributes.booking_email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  (stand.attributes.booking_email = e.target.value)
                }
                disabled={false}
                sx={{ width: '100%' }}
              />
            </Grid>
          </>
        ) : null}
        <Grid item xs={12} sm={6}>
          <FormGroup>
            <FormControlLabel
              disabled={false}
              control={
                <Switch
                  checked={stand.attributes.restaurant}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    (stand.attributes.restaurant = e.target.checked)
                  }
                />
              }
              label="La empresa es un restaurante?"
            />
          </FormGroup>
        </Grid>
      </Grid>
    </PaperCard>
  );
};

export default BookingInputData;
