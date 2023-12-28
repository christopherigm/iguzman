import React, {
  ReactElement,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import {PaperCard} from 'ui';
import Stand from 'classes/stand';

type Props = {
  isLoading: boolean;
  displayAdvancedOptions?: boolean;
  advancedOptions: boolean;
  stand: Stand;
  switchAdvancedOptions: (value: boolean) => void;
};

const CompanyBasicInformationInput = ({
    isLoading,
    displayAdvancedOptions=true,
    advancedOptions,
    stand,
    switchAdvancedOptions,
  }: Props): ReactElement => {
  return (
    <PaperCard>
      <Typography variant='body1'>
        Informacion basica de la empresa
      </Typography>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Grid
        container
        columnSpacing={3}
        rowSpacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label='Nombre de la empresa'
            variant='outlined'
            size='small'
            type='text'
            value={stand.attributes.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              stand.attributes.name = e.target.value
            }
            disabled={false}
            style={{width: '100%'}}/>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label='Descripcion corta de la empresa'
            variant='outlined'
            size='small'
            type='text'
            value={stand.attributes.short_description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              stand.attributes.short_description = e.target.value
            }
            disabled={false}
            style={{width: '100%'}}/>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label='Correo de contacto'
            variant='outlined'
            size='small'
            type='email'
            value={stand.attributes.contact_email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              stand.attributes.contact_email = e.target.value
            }
            disabled={false}
            style={{width: '100%'}}/>
        </Grid>
        {
          displayAdvancedOptions ?
            <Grid item xs={12}>
              <FormGroup>
                <FormControlLabel
                  disabled={isLoading}
                  control={
                    <Switch
                      checked={advancedOptions}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                        switchAdvancedOptions(e.target.checked)
                      } />
                  }
                  label='Informacion adicional (opcional)' />
              </FormGroup>
            </Grid> : null
        }
      </Grid>
    </PaperCard>
  );
};

export default CompanyBasicInformationInput;
