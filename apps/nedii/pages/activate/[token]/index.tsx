import React, {
  ReactElement,
  useEffect,
  useState,
} from 'react';
import Head from 'next/head';
import Typography from '@mui/material/Typography';
import {
  GetCookieCachedValues,
  GetEnvVariables,
  API,
  APICreationErrorHandler,
} from 'utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages,
} from 'utils';
import MainLayout from 'layouts/main-layout';
import {SystemInitalState} from 'interfaces/system-interface';
import type System from 'interfaces/system-interface';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Link from 'next/link';
import type {APIPostCreationError} from 'utils';

const Page = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);
  const setSystem = (s: System): void => updateSystem(_s => s);
  const setIsLoading = (): void => setSystem({
    ...system,
    isLoading: true
  });
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<Array<APIPostCreationError>>([]);

  useEffect(() => {
    setIsLoading();
    API.ActivateUser ({
      URLBase: system.URLBase,
      attributes: {
        token: system.token ? system.token : ''
      }
    })
      .then(() => {
        setSystem({
          ...system,
          isLoading: false
        });
        setSuccess(_p => true);
      })
      .catch((error) => {
        setSystem({
          ...system,
          isLoading: false
        })
        if (error.length) {
          setError(_p => APICreationErrorHandler(error));
        } else {
          setError(_p => [{
            status: 500,
            code: '',
            detail: '',
            pointer: ''
          }])
        }
      });
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
        <title>Nedii</title>
        <meta name='og:title' content={'siteTitle'} />
        <meta name='twitter:card' content='summary_large_image' />
      </Head>
      {
        success ?
          <>
          <Typography
            marginTop={3}
            variant='h4'
            color={system.darkMode ? 'primary.contrastText' : ''}>
            Cuenta activada exitosamente!
          </Typography>
          <Stack sx={{ width: '100%' }} spacing={2} marginTop={2}>
            <Alert severity='success'>
              Puedes iniciar sesion <Link href='/sign-in'>aqui</Link>
            </Alert>
          </Stack>
          </> : null
      }
      {
        error.length &&
        error[0].status === 500 ?
          <>
            <Typography
              marginTop={3}
              marginBottom={3}
              variant='h4'
              color={system.darkMode ? 'primary.contrastText' : ''}>
              Error activando cuenta
            </Typography>
            <Stack sx={{ width: '100%' }} spacing={2}>
              <Alert severity='error'>
                Error: el codigo de activacion es incorrecto, por favor
                contacte al administrador de la plataforma
              </Alert>
              <Alert severity='info'>
                Puedes iniciar sesion <Link href='/sign-in'>aqui</Link>
              </Alert>
              <Alert severity='success'>
                Restablecer tu contraseña <Link href='/reset-password'>aqui</Link>
              </Alert>
            </Stack>
          </> : null
        }
        {
          error.length &&
          error[0].status === 404 ?
            <>
              <Typography
                marginTop={3}
                marginBottom={3}
                variant='h4'
                color={system.darkMode ? 'primary.contrastText' : ''}>
                Error activando cuenta
              </Typography>
              <Stack sx={{ width: '100%' }} spacing={2}>
                <Alert severity='error'>
                  Error: es probable que el codigo de activacion
                  ya haya sido utilizado antes, por favor
                  contacte al administrador de la plataforma.
                </Alert>
                <Alert severity='info'>
                  Puedes iniciar sesion <Link href='/sign-in'>aqui</Link>
                </Alert>
                <Alert severity='success'>
                  Restablecer tu contraseña <Link href='/reset-password'>aqui</Link>
                </Alert>
              </Stack>
            </> : null
          }
    </MainLayout>
  );
};

export async function getServerSideProps({ req, params }: any) {
  const cookies = req.cookies;
  const env = GetEnvVariables() as EnvironmentVariables;
  const cachedValues: CachedValues = GetCookieCachedValues(cookies);
  const props: System = {
    ...SystemInitalState,
    ...env,
    ...cachedValues,
    language: cachedValues.language ? cachedValues.language : env.defaultLanguage as Languages,
    token: params.token || null,
  };
  return {props};
};

export default Page;
