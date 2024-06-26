import React, { ReactElement, useEffect, useState } from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import {
  GetCookieCachedValues,
  GetEnvVariables,
  API,
  APIPostCreationError,
} from '@repo/utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages,
} from '@repo/utils';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Link from 'next/link';
import { MainLayout } from '@repo/ui';
import System, { system } from 'classes/system';
import { user } from 'classes/user';

const Page = (props: any): ReactElement => {
  useEffect(() => {
    system.setDataFromPlainObject(props);
  }, [props]);

  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<Array<APIPostCreationError>>([]);

  return (
    <MainLayout
      darkMode={system.darkMode}
      refreshToken={() => user.refreshToken()}
      switchTheme={() => system.switchTheme()}
      devMode={system.devMode}
      switchDevMode={() => system.switchDevMode()}
      isLoading={system.isLoading}
      language={props.defaultLanguage}
      loginEnabled={props.loginEnabled}
      version={props.version}
      logo={system.logo}
      hostName={props.hostName}
    >
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <meta
          name="description"
          content="Learn how to build a personal website using Next.js"
        />
        <title>Nedii</title>
        <meta name="og:title" content={'siteTitle'} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      {success ? (
        <>
          <Typography
            marginTop={3}
            variant="h5"
            color={system.darkMode ? 'primary.contrastText' : ''}
          >
            Cuenta activada exitosamente!
          </Typography>
          <Stack sx={{ width: '100%' }} spacing={2} marginTop={2}>
            <Alert severity="success">
              Puedes iniciar sesion <Link href="/sign-in">aqui</Link>.
            </Alert>
          </Stack>
        </>
      ) : null}
    </MainLayout>
  );
};

export async function getServerSideProps({ req, params }: any) {
  const system = System.getInstance();
  system.parseCookies(req.cookies);
  return {
    props: {
      ...system.getPlainObject(),
      token: params.token || '',
    },
  };
}

export default Page;
