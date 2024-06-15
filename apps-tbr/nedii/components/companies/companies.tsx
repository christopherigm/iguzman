import React, { ReactElement, useState, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import type { Languages } from 'utils';
import GetUserCompanies from 'local-utils/get-user-companies';
import NoCompanies from './no-companies';
import AddCompanies from './add-company';
import Stand from 'classes/stand';
import { user } from 'classes/user';

type Props = {
  darkMode: boolean;
  URLBase: string;
  language: Languages;
};

const Companies = ({ darkMode, URLBase, language }: Props): ReactElement => {
  const [companies, setCompanies] = useState([]);
  const [addCompany, setAddCompany] = useState(false);

  useEffect(() => {
    user.setDataFromLocalStorage();
    user.URLBase = URLBase;
    if (user.access) {
      GetUserCompanies({
        URLBase,
        jwt: user.access,
        userID: user.id,
      })
        .then((data: any) => {
          console.log('data', data);
        })
        .catch((error) => {
          console.log('error', error);
        });
    }
  }, [URLBase]);

  if (!companies.length && !addCompany) {
    return <NoCompanies onClick={() => setAddCompany(true)} />;
  }

  if (addCompany) {
    return (
      <AddCompanies URLBase={URLBase} language={language} jwt={user.access} />
    );
  }

  return (
    <>
      {user && user.access && companies.length ? (
        <Grid container marginTop={1} columnSpacing={2} rowSpacing={2}>
          <Grid item xs={12} sm={6} md={4} marginBottom={2}>
            Side Bar
          </Grid>
          <Grid item xs={12} sm={6} md={8} marginBottom={2}>
            {user && user.access ? (
              <Box>
                <Paper elevation={1}>
                  <Box padding={1.5}>
                    <Typography variant="body2">
                      Direcciones de entrega
                    </Typography>
                    Companies here...
                  </Box>
                </Paper>
              </Box>
            ) : null}
            <Box marginTop={3}>
              <Paper elevation={1}>
                <Box padding={1.5}>
                  <Typography variant="body2">Formas de pagos</Typography>
                </Box>
              </Paper>
            </Box>
          </Grid>
        </Grid>
      ) : null}
    </>
  );
};

export default Companies;
