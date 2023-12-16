import React, { ReactElement, useEffect } from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import { BaseUser } from 'utils';
import { MainLayout } from 'ui';
import System, { system } from 'classes/system';
import DownloadForm from 'components/download-form';
import GridOfItems from 'components/gird-of-items';

const user = BaseUser.getInstance();

const Page = (props: any): ReactElement => {
  useEffect(() => {
    system.setServerSideProps(props);
    system.getItemsFromLocalStorage();
    user.getUserFromLocalStorage();
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
        <link rel="icon" href="/favicon.ico" />
        <meta
          name="description"
          content="Learn how to build a personal website using Next.js"
        />
        <title>Video downloader</title>
        <meta name="og:title" content={'siteTitle'} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <Typography
        marginTop={3}
        variant="h5"
        color={system.darkMode ? 'primary.contrastText' : ''}
      >
        Video downloader
      </Typography>
      <Box marginTop={1.5} marginBottom={1}>
        <Divider />
      </Box>
      <DownloadForm
        URLBase={props.URLBase}
        callback={(url: string) => system.addItem(url)}
      />
      {system.items.length ? (
        <>
          <Box marginTop={1.5} marginBottom={1}>
            <Divider />
          </Box>
          <GridOfItems
            items={system.items}
            onDeleteItem={(id: string) => system.deleteItem(id)}
          />
          <Box marginTop={1.5} marginBottom={1}>
            <Divider />
          </Box>
        </>
      ) : null}
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const props = System.getInstance();
  props.parseCookies(req.cookies);
  return { props: props.getServerSideProps() };
}

export default Page;
