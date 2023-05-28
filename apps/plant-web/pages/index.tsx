import {
  ReactElement,
  useState
} from 'react';
import Head from 'next/head';
import {
  GetUserFromCookie,
  GetCookieCachedValues,
  GetEnvVariables
} from 'utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages,
} from 'utils';
import Typography from '@mui/material/Typography';
import MainLayout from 'layouts/main-layout';
import {SystemInitalState} from 'interfaces/system-interface';
import type System from 'interfaces/system-interface';
import type UserInterface from 'interfaces/user-interface';
import type PlantInterface from 'interfaces/plant-interface';
import GetMainPagePlants from 'local-utils/get-main-page-plants';
import PlantsGrid from 'components/plants-grid';

const Page = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);
  const setSystem = (s: System): void => updateSystem(_s => s);

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
        variant='subtitle1'
        color={system.darkMode ? 'primary.contrastText' : ''}>
        {system.plants.length} plants found
      </Typography>
      <PlantsGrid plants={system.plants} />
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
    user = await GetUserFromCookie(cookies) as UserInterface;
    plants = await GetMainPagePlants({URLBase: env.URLBase}) as Array<PlantInterface>;
  } catch (error) {
    
  }
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
