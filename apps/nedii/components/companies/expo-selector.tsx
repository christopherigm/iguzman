import React, { ReactElement } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Expo, { expo } from 'classes/expo';
import { useEffect } from '@preact-signals/safe-react/react';
import ExpoItem from 'components/companies/expo-item';
import { system } from 'classes/system';
import Divider from '@mui/material/Divider';

type Props = {
  groupID: number;
  expoSelectedID: number;
  onSelect: (expo: Expo) => void;
};

const expos: Signal<Array<Expo>> = signal([]);
const isLoading: Signal<boolean> = signal(false);

const ExpoSelector = ({
  groupID,
  expoSelectedID = 0,
  onSelect,
}: Props): ReactElement => {
  useEffect(() => {
    system.setDataFromLocalStorage();
    isLoading.value = true;
    expo
      .getExpos([groupID])
      .then((data) => (expos.value = data))
      .catch((e) => console.log('e:', e))
      .finally(() => (isLoading.value = false));
  }, [groupID]);

  return (
    <>
      {isLoading.value ? (
        <>
          <Typography variant="body1">Cargadon expos...</Typography>
          <Grid item xs={12}>
            <Box sx={{ width: '100%' }}>
              <LinearProgress />
            </Box>
          </Grid>
        </>
      ) : (
        <>
          <Typography variant="body1" marginTop={3}>
            {expos.value.length ? (
              <>Seleccione una Expo para la empresa</>
            ) : (
              <>No hay Expos en esta categoria aun {':('}</>
            )}
          </Typography>
          <Box marginTop={2}>
            <Divider />
          </Box>
          <Grid container spacing={2} marginTop={0.5}>
            {expos.value.map((expo: Expo, index: number) => {
              expo.selected = expo.id === expoSelectedID;
              return (
                <Grid item xs={6} md={4} key={index}>
                  <ExpoItem
                    onClick={() => {
                      expos.value.map((i) => (i.selected = false));
                      expo.selected = !expo.selected;
                      onSelect(expo);
                    }}
                    expo={expo}
                    selected={expo.selected}
                  />
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
    </>
  );
};

export default ExpoSelector;
