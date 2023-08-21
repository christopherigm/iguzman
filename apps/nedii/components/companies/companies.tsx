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
import GetUserCompanies from 'local-utils/get-user-companies';
import NoCompanies from './no-companies';
import AddCompanies from './add-company';

interface Props {
  darkMode: boolean;
  URLBase: string;
  language: 'en' | 'es';
};

const Companies = ({
    darkMode,
    URLBase,
    language,
  }: Props): ReactElement => {
  const [user, setUser] = useState<UserInterface | null>(null);
  const [jwt, setJWT] = useState<JWTPayload | null>(null);
  const [companies, setCompanies] = useState([]);
  const [addCompany, setAddCompany] = useState(false);

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
    if (user && jwt) {
      GetUserCompanies({
        URLBase,
        jwt: jwt.access,
        userID: Number(user.id)
      })
        .then((data: any) => {
          console.log('data', data);
        })
        .catch((error) => {
          console.log('error', error);
        });
    }
  }, [user, jwt, URLBase]);

  if (!companies.length && !addCompany) {
    return <NoCompanies onClick={() => setAddCompany(true)} />;
  }

  if (addCompany && jwt) {
    return <AddCompanies
      URLBase={URLBase}
      language={language}
      jwt={jwt.access} />;
  }

  return (
    <>
    {
      user && jwt && companies.length?
        <Grid container
          marginTop={1}
          columnSpacing={2}
          rowSpacing={2}>
          <Grid item
            xs={12}
            sm={6}
            md={4}
            marginBottom={2}>
            Side Bar
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
                  Companies here...
                </Box>
                </Paper>
                </Box> : null
            }
            <Box marginTop={3}>
            <Paper elevation={1}>
            <Box padding={1.5}>
              <Typography variant='body2'>
                Formas de pagossss
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

export default Companies;
