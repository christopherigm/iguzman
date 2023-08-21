import React, {
  ReactElement,
  useState,
  useEffect,
} from 'react';
import {
  GetLocalStorageData,
} from 'utils';
import type UserInterface from 'interfaces/user-interface';
import type { JWTPayload } from 'utils';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import UserAddress from './user-address';
import UserInfo from './user-info';

interface Props {
  darkMode: boolean;
  URLBase: string;
};

const AccountEditor = ({
    darkMode,
    URLBase,
  }: Props): ReactElement => {
  const [user, setUser] = useState<UserInterface | null>(null);
  const [jwt, setJWT] = useState<JWTPayload | null>(null);

  useEffect(() => {
    if (!user) {
      const u = GetLocalStorageData('user');
      if (u) {
        setUser( _p => JSON.parse(u) as UserInterface);
      }
    }
    if (!jwt) {
      const cachedJWT = GetLocalStorageData('jwt');
      if (cachedJWT) {
        setJWT(_p => JSON.parse(cachedJWT) as JWTPayload);
      }
    }
  }, [user, jwt]);

  return (
    <>
    {
      user && jwt ?
        <Grid container
          marginTop={1}
          columnSpacing={2}
          rowSpacing={2}>
          <Grid item
            xs={12}
            sm={6}
            md={4}
            marginBottom={2}>
            <UserInfo
              darkMode={darkMode}
              URLBase={URLBase}
              jwt={jwt.access} />
          </Grid>
          <Grid item
            xs={12}
            sm={6}
            md={8}
            marginBottom={2}>
            {
              user && jwt ?
                <Box>
                  <Paper elevation={1}>
                    <Box padding={1.5}>
                      <Typography variant='body2'>
                        Direcciones de entrega
                      </Typography>
                      <UserAddress
                        darkMode={darkMode}
                        userID={Number(user.id)}
                        URLBase={URLBase}
                        jwt={jwt.access} />
                    </Box>
                  </Paper>
                </Box> : null
            }
            <Box marginTop={3}>
            <Paper elevation={1}>
            <Box padding={1.5}>
              <Typography variant='body2'>
                Formas de pago
              </Typography>
            </Box>
            </Paper>
            </Box>
          </Grid>
        </Grid> : null
    }
    </>
    
  );
};

export default AccountEditor;
