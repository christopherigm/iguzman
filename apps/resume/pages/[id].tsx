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
import UserResumeHeader from 'components/user-resume-header';

const user = User.getInstance();
const pageUser = User.getInstance();

const Page = (props: any) => {
  pageUser.setResumeUserAttributesFromPlainObject(props.user ?? {});

  useEffect(() => {
    system.setResumeSystemAttributesFromPlainObject(props);
    user.getResumeUserFromLocalStorage();
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
      maxWidth={false}
    >
      <Head>
        <link rel="icon" href="favicon.ico" />
        <meta name="description" content="Video downloader" />
        <title>My Resume</title>
        <meta name="og:title" content="Video downloader" />
        <meta name="twitter:card" content="/images/logo.png" />
      </Head>
      {pageUser && pageUser.id ? (
        <UserResumeHeader
          user={pageUser}
          darkMode={system.darkMode}
          devMode={system.devMode}
        />
      ) : null}
    </MainLayout>
  );
};

export async function getServerSideProps({ req, params }: any) {
  const system = System.getInstance();
  system.parseCookies(req.cookies);
  user.URLBase = system.URLBase;
  if (!isNaN(Number(params.id))) {
    user.id = params.id;
  } else if (params.id !== undefined && params.id !== '') {
    user.attributes.username = params.id;
  }
  // console.log('User:', user.id);
  // console.log(params.id, user.id, Number(params.id), user.attributes.username);
  const data = await user.getUserFromAPI();
  return {
    props: {
      ...system.getResumePlainAttributes(),
      user: data,
    },
  };
}

export default Page;
