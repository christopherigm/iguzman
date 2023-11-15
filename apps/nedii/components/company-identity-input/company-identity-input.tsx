import React, { ReactElement } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import { PaperCard } from 'ui';
import Stand from 'classes/stand';

type Props = {
  stand: Stand;
};

const CompanyIdentityInput = ({ stand }: Props): ReactElement => {
  return (
    <PaperCard>
      <Typography variant="body1">Identidad de la empresa</Typography>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Grid container rowSpacing={2} columnSpacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label="Slogan de la empresa"
            variant="outlined"
            size="small"
            type="text"
            value={stand.attributes.slogan}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.slogan = e.target.value)
            }
            disabled={false}
            sx={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label="Mision de la empresa"
            variant="outlined"
            size="small"
            multiline={true}
            rows={5}
            type="text"
            value={stand.attributes.mission}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.mission = e.target.value)
            }
            disabled={false}
            sx={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            label="Vision de la empresa"
            variant="outlined"
            size="small"
            multiline={true}
            rows={5}
            type="text"
            value={stand.attributes.vision}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (stand.attributes.vision = e.target.value)
            }
            disabled={false}
            sx={{ width: '100%' }}
          />
        </Grid>
      </Grid>
    </PaperCard>
  );
};

export default CompanyIdentityInput;
