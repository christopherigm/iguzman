import React, { useEffect } from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { BaseUser } from '@repo/utils';
import { MainLayout } from '@repo/ui';
import System, { system } from 'classes/system';
import DownloadForm from 'components/download-form';
import GridOfItems from 'components/gird-of-items';
import type { DownloadOptions } from 'classes/item';

const user = BaseUser.getInstance();

const Page = (props: any) => {
  useEffect(() => {
    system.setVDSystemAttributesFromPlainObject(props);
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
        <meta name="description" content="Video downloader" />
        <title>Video downloader</title>
        <meta name="og:title" content="Video downloader" />
        <meta name="twitter:card" content="/images/logo.png" />
      </Head>
      <Typography
        marginTop={3}
        variant="h5"
        color={system.darkMode ? 'primary.contrastText' : ''}
      >
        Video downloader
      </Typography>
      <Box marginTop={1.5}>
        <Divider />
      </Box>
      {system.supported ? (
        <>
          <DownloadForm
            URLBase={props.URLBase}
            callback={(url: string, options: DownloadOptions) =>
              system.addItem(url, options)
            }
          />
          {system.items.length ? (
            <>
              <Box marginTop={1.5} marginBottom={2}>
                <Divider />
              </Box>
              <GridOfItems
                items={system.items}
                onDeleteItem={(id: string) => system.deleteItem(id)}
                devMode={system.devMode}
                darkMode={system.darkMode}
              />
            </>
          ) : null}
        </>
      ) : (
        <Stack marginTop={2} sx={{ width: '100%' }} spacing={2}>
          <Alert severity="error">
            Browser not supported, please switch to Safari.
          </Alert>
        </Stack>
      )}
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const system = System.getInstance();
  system.parseCookies(req.cookies);
  system.userAgent = req.headers['user-agent'] ?? '';
  system.checkForiOS();
  return { props: system.getVDPlainAttributes() };
}

export default Page;
