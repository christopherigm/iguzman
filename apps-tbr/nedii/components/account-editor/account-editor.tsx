import React, { ReactElement, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import UserAddress from './user-address';
import UserInfo from './user-info';
import { user } from 'classes/user';

type Props = {
  darkMode: boolean;
  URLBase: string;
  isLoading: boolean;
  switchLoading: (v: boolean) => void;
};

const AccountEditor = ({
  darkMode = false,
  URLBase,
  isLoading = false,
  switchLoading,
}: Props): ReactElement => {
  useEffect(() => {
    user.getNediiUserFromLocalStorage();
  }, []);

  return (
    <>
      {user.id ? (
        <Grid container marginTop={1} columnSpacing={2} rowSpacing={2}>
          <Grid item xs={12} sm={6} md={4} marginBottom={2}>
            <UserInfo
              darkMode={darkMode}
              URLBase={URLBase}
              isLoading={isLoading}
              switchLoading={(v: boolean) => switchLoading(v)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={8} marginBottom={2}>
            {user ? (
              <Box>
                <Paper elevation={1}>
                  <Box padding={1.5}>
                    <Typography variant="body2">
                      Direcciones de entrega
                    </Typography>
                    <UserAddress
                      darkMode={darkMode}
                      userID={Number(user.id)}
                      URLBase={URLBase}
                      jwt={user.access}
                    />
                  </Box>
                </Paper>
              </Box>
            ) : null}
            <Box marginTop={3}>
              <Paper elevation={1}>
                <Box padding={1.5}>
                  <Typography variant="body2">Formas de pago</Typography>
                </Box>
              </Paper>
            </Box>
          </Grid>
        </Grid>
      ) : null}
    </>
  );
};

export default AccountEditor;
