import React, { useEffect } from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import User from 'classes/user';
import { MainLayout } from '@repo/ui';
import System, { system } from 'classes/system';
import { Grid } from '@mui/material';
import ResumesGrid from 'components/resumes-grid';

const user = User.getInstance();

const Page = (props: any) => {
  useEffect(() => {
    system.setResumeSystemAttributesFromPlainObject(props);
    system.getItemsFromLocalStorage();
    system.getUsers();
  }, [props]);

  return (
    <MainLayout
      darkMode={system.darkMode}
      switchTheme={() => system.switchTheme()}
      devMode={system.devMode}
      switchDevMode={() => system.switchDevMode()}
      isLoading={system.isLoading}
      language={props.defaultLanguage}
      user={{
        firstname: user.attributes.first_name,
        lastname: user.attributes.last_name,
        username: user.attributes.username,
        img_picture: user.attributes.img_picture,
      }}
      loginEnabled={props.loginEnabled}
      version={props.version}
      logo="/images/logo.png"
      hostName={props.hostName}
    >
      <Head>
        <link rel="icon" href="/images/favicon.ico" />
        <meta name="description" content="Video downloader" />
        <title>My Resume</title>
        <meta name="og:title" content="Video downloader" />
        <meta name="twitter:card" content="/images/logo.png" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.0.0/css/flag-icons.min.css"
        />
      </Head>
      <Typography
        marginTop={3}
        variant="h5"
        color={system.darkMode ? 'primary.contrastText' : ''}
      >
        My Resume
      </Typography>
      <Box marginTop={1.5}>
        <Divider />
      </Box>
      {system.users && system.users.length ? (
        <ResumesGrid
          items={system.users}
          onDeleteItem={(id) => console.log('id', id)}
          devMode={system.darkMode}
          darkMode={system.darkMode}
        />
      ) : null}
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const system = System.getInstance();
  system.parseCookies(req.cookies);
  return { props: system.getResumePlainAttributes() };
}

export default Page;
