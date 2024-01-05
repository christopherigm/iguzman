import React, { ReactElement, useEffect } from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/router';
import { SetLocalStorageData } from 'utils';
import { SignInForm, MainLayout } from 'ui';
import System, { system } from 'classes/system';
import { user } from 'classes/user';

const Page = (props: any): ReactElement => {
  const router = useRouter();

  useEffect(() => {
    system.setServerSideProps(props);
  }, [props]);

  const callback = (data: any) => {
    SetLocalStorageData(user.type, JSON.stringify(data));
    router.push('/');
  };

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
      logo="/images/logo.jpg"
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
        Acceder a mi cuenta
      </Typography>
      <SignInForm URLBase={props.URLBase} callback={callback} />
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const props = System.getInstance();
  props.parseCookies(req.cookies);
  return { props: props.getServerSideProps() };
}

export default Page;
