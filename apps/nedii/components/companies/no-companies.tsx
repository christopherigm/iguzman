import React, {
  ReactElement,
} from 'react';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';

type Props = {
  onClick: () => void;
}

const NoCompanies = ({onClick}: Props): ReactElement => {
  return (
    <Grid container
      marginTop={1}
      columnSpacing={2}
      rowSpacing={2}>
      <Grid item xs={12}>
        <Stack sx={{ width: '100%' }} spacing={2}>
          <Alert severity='info'>
            Aun no hay empresas registradas en tu perfil.
          </Alert>
          <Alert severity='success' sx={{cursor: 'pointer'}} onClick={onClick}>
            Crea una empresa gratis dando click aqui.
          </Alert>
        </Stack>
      </Grid>
    </Grid>
  );
};

export default NoCompanies;
