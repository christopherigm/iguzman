import React, { ReactElement, useEffect } from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import { ResetPasswordForm, MainLayout } from '@repo/ui';
import System, { system } from 'classes/system';

const Page = (props: any): ReactElement => {
  useEffect(() => {
    system.setNediiSystemAttributesFromPlainObject(props);
  }, [props]);

  return (
    <MainLayout
      darkMode={system.darkMode}
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
      <Typography
        marginTop={3}
        variant="h5"
        color={system.darkMode ? 'primary.contrastText' : ''}
      >
        Restablecer contraseña
      </Typography>
      <ResetPasswordForm URLBase={system.URLBase} callback={() => {}} />
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const props = System.getInstance();
  props.parseCookies(req.cookies);
  return { props: system.getNediiPlainAttributes() };
}

export default Page;
