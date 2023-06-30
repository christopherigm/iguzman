import {
  ReactElement,
  useEffect,
  useState,
} from 'react';
import Head from 'next/head';
import {
  GetUserFromCookie,
  GetCookieCachedValues,
  GetEnvVariables,
  ReplaceURLBase,
  GetLocalStorageData,
  SetLocalStorageData,
} from 'utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages,
} from 'utils';
import Typography from '@mui/material/Typography';
import MainLayout from 'layouts/main-layout';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import {SystemInitalState} from 'interfaces/system-interface';
import type System from 'interfaces/system-interface';
// import type UserInterface from 'interfaces/user-interface';
import type PlantInterface from 'interfaces/plant-interface';
import GetMainPagePlants from 'local-utils/get-main-page-plants';
import PlantsGrid from 'components/plants-grid';

const Page = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);
  const setSystem = (s: System): void => updateSystem(_s => s);

  const setIsLoading = () => setSystem({
    ...system,
    isLoading: true
  });

  useEffect(() => {
    const cachedPlants = GetLocalStorageData('plants');
    if (cachedPlants) {
      const plants = JSON.parse(cachedPlants) as Array<PlantInterface>;
      setSystem({
        ...system,
        plants: plants,
        isLoading: false
      });
    } else {
      setIsLoading();
    }
    GetMainPagePlants({
      URLBase: system.URLBase
    })
      .then((data: Array<PlantInterface>) => {
        setSystem({
          ...system,
          plants: data,
          isLoading: false
        });
        SetLocalStorageData('plants', JSON.stringify(data));
      })
      .catch((error) => console.log('error:', error));
  }, [])

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
        <title>My plants</title>
        <meta name='og:title' content={'siteTitle'} />
        <meta name='twitter:card' content='summary_large_image' />
      </Head>
      <Typography
        marginTop={3}
        variant='h4'
        color={system.darkMode ? 'primary.contrastText' : ''}>
        {
          system.isLoading && !system.plants.length ?
            <>Loading plants...</> :
            <>{system.plants.length} plants found</>
        }
      </Typography>
      <Box
        marginTop={1.5}
        marginBottom={1}>
        <Divider />
      </Box>
      <PlantsGrid
        plants={system.plants}
        darkMode={system.darkMode}
        setIsLoading={setIsLoading} />
    </MainLayout>
  );
};

export async function getServerSideProps({ req }: any) {
  const cookies = req.cookies;
  const env = GetEnvVariables() as EnvironmentVariables;
  let user = null;
  const cachedValues: CachedValues = GetCookieCachedValues(cookies);
  let plants: Array<PlantInterface> = [];
  try {
    // if (cookies.jwt) {
    //   user = await GetUserFromCookie({
    //     jwt: cookies.jwt,
    //     URLBase: env.hostName === 'localhost' ? env.URLBase : env.K8sURLBase
    //   }) as UserInterface;
    // }
  } catch (error) {
    console.log('error:', error);
  }
  // if (env.hostName !== 'localhost') {
  //   plants=ReplaceURLBase(plants, env.K8sURLBase, env.URLBase) as Array<PlantInterface>;
  // }
  const props: System = {
    ...SystemInitalState,
    ...env,
    ...cachedValues,
    language: cachedValues.language ? cachedValues.language : env.defaultLanguage as Languages,
    user,
    plants,
    plant: null,
    measurements: []
  };
  return {props};
};

export default Page;
