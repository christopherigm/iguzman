import React, { ReactElement, useEffect } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Grid from '@mui/material/Grid';
import { user } from 'classes/user';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
import AddIcon from '@mui/icons-material/Add';
import { MenuItemWithIcon } from '@repo/ui';
import { VerticalMenu } from '@repo/ui';
import type { VerticalMenuItemProps } from '@repo/ui';
import Stand from 'classes/stand';

const addOrEditCompany: Signal<boolean> = signal(false);
const currentCompany: Signal<Stand> = signal(new Stand());
const isLoading: Signal<boolean> = signal(false);

type Props = {
  darkMode: boolean;
  URLBase: string;
};

const Companies = ({ darkMode = false, URLBase }: Props): ReactElement => {
  useEffect(() => {
    addOrEditCompany.value = false;
    isLoading.value = true;
    user.getNediiUserFromLocalStorage();
    user.URLBase = URLBase;
    user.getUserCompaniesFromAPI().finally(() => (isLoading.value = false));
  }, []);

  const onComplete = () => {
    addOrEditCompany.value = false;
    isLoading.value = true;
    user.getUserCompaniesFromAPI().finally(() => (isLoading.value = false));
  };

  return (
    <Paper elevation={1}>
      <Box padding={1.5}>
        <Typography variant="body2">Mis empresas</Typography>
        <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
          <Grid item xs={4} sm={2}>
            <MenuItemWithIcon
              darkMode={darkMode}
              icon={<AddIcon />}
              label="Agregar empresa"
              selected={false}
              isLoading={isLoading.value}
              onClick={() => {}}
            />
          </Grid>
          {isLoading.value ? (
            <Grid item xs={12}>
              <Box sx={{ width: '100%' }}>
                <LinearProgress />
              </Box>
            </Grid>
          ) : null}
        </Grid>
      </Box>
    </Paper>
  );
};

export default Companies;
