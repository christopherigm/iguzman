import React, {
  ReactElement,
  useState,
  useEffect,
} from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
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
import TextField from '@mui/material/TextField';
import Link from 'next/link';
import Button from '@mui/material/Button';


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
      </Box>
      <Link href='/reporte-de-avances'>
        <Button variant="contained">Reporte diario</Button>
      </Link>
      <Link href={'/reporte-admin'}>
        <Button variant='contained'>Reporte Administrativo</Button>
      </Link>
      <Link href={'/reporte-bim'}>
        <Button variant='contained'>Reporte Bim</Button>
      </Link>
      <Link href={'/reportes-rfi'}>
        <Button variant='contained'>Reporte RFI</Button>
      </Link>
      <Link href={'/minutas'}>
        <Button variant='contained'>Minutas</Button>
      </Link>
      <Link href={'/generador-titulos'}>
        <Button variant='contained'>Generador Titulos</Button>
      </Link>
      <Link href={'/bitacora'}>
        <Button variant='contained'>Bitacora</Button>
      </Link>
      <Link href={'/registro-de-empresa'}>
        <Button variant='contained'>Registro de empresas</Button>
      </Link>
      <Link href={'/registro-de-proyecto'}>
        <Button variant='contained'>Registro de Proyectos</Button>
      </Link>
      <Link href={'/registro-de-disciplinas'}>
        <Button variant='contained'>Registro de disciplinas</Button>
      </Link>
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
