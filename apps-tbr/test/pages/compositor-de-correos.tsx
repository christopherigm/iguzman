import React, {
    ReactElement,
    useState,
    useEffect,
  } from 'react';
  import Head from 'next/head';
  import Typography from '@mui/material/Typography';
  import Box from '@mui/material/Box';
  import {
    GetCookieCachedValues,
    GetEnvVariables,
    GetLocalStorageData,
  } from 'utils';
  import type {
    EnvironmentVariables,
    CachedValues,
    Languages,
  } from 'utils';
  import MainLayout from 'layouts/main-layout';
  import {SystemInitalState} from 'interfaces/system-interface';
  import type UserInterface from 'interfaces/user-interface';
  import type System from 'interfaces/system-interface';
import Link from 'next/link';
import Button from '@mui/material/Button';
import CompositorDeCorreos from 'components/compositor-de-correos';
  
  const Page = (props: System): ReactElement => {
    const [system, updateSystem] = useState<System>(props);
    const setSystem = (s: System): void => updateSystem(_s => s);
  
    useEffect(() => {
      const user = GetLocalStorageData('user');
      if (user) {
        setSystem({
          ...system,
          user: JSON.parse(user) as UserInterface
        });
      }
    }, []);
  
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
          <title>Test</title>
          <meta name='og:title' content={'siteTitle'} />
          <meta name='twitter:card' content='summary_large_image' />
        </Head>
        <Box
          marginTop={2}>
          <CompositorDeCorreos/>
          <Box
            marginTop={10}>
            <Link href='/'>
              <Button variant="contained">Inicio</Button>
            </Link>
          </Box>
        </Box>
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
  