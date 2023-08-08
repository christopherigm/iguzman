import React, {
  ReactElement,
  useState,
} from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import {
  GetCookieCachedValues,
  GetEnvVariables,
} from 'utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages,
} from 'utils';
import MainLayout from 'layouts/main-layout';
import {SystemInitalState} from 'interfaces/system-interface';
import type System from 'interfaces/system-interface';
import {ResetPasswordForm} from 'ui';

const Page = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);
  const setSystem = (s: System): void => updateSystem(_s => s);

  return (
    <MainLayout
      system={system}
      setSystem={setSystem}>
      <Head>
        <link rel='icon' href='/favicon.ico' />
        <meta
          name='description'
          content='Learn how to build a personal website using Next.js'
        />
        <title>Nedii</title>
        <meta name='og:title' content={'siteTitle'} />
        <meta name='twitter:card' content='summary_large_image' />
      </Head>
      <Typography
        marginTop={3}
        variant='h5'
        color={system.darkMode ? 'primary.contrastText' : ''}>
        Restablecer contraseña
      </Typography>
      <ResetPasswordForm
        URLBase={system.URLBase}
        callback={() => {}} />
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const cookies = req.cookies;
  const env = GetEnvVariables() as EnvironmentVariables;
  const cachedValues: CachedValues = GetCookieCachedValues(cookies);
  const props: System = {
    ...SystemInitalState,
    ...env,
    ...cachedValues,
    language: cachedValues.language ? cachedValues.language : env.defaultLanguage as Languages,
  };
  return {props};
};

export default Page;
