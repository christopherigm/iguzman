import {
  ReactElement,
  useState,
} from 'react';
import Head from 'next/head';
import {
  GetUserFromCookie,
  GetCookieCachedValues,
  GetEnvVariables,
} from 'utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages,
} from 'utils';
import MainLayout from 'layouts/main-layout';
import {SystemInitalState} from 'interfaces/system-interface';
import type System from 'interfaces/system-interface';
import type UserInterface from 'interfaces/user-interface';
import type PlantInterface from 'interfaces/plant-interface';
import type MeasurementInterface from 'interfaces/measurement-interface';
import GetPlantBySlug from 'local-utils/get-plant-by-slug';
import GetPlantMeasurements from 'local-utils/get-plant-measurements';
import MeasurementTable from 'components/measurement-table';

import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardMedia from '@mui/material/CardMedia';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

const PlantDetail = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);
  const setSystem = (s: System): void => updateSystem(_s => s);

  if (!system.plant || !system.measurements.length) {
    return(
      <>No data</>
    );
  }

  const img = system.plant && system.plant.attributes.img_picture ?
    system.plant.attributes.img_picture :
    system.plant && system.plant.relationships.plant_type.data &&
    system.plant.relationships.plant_type.data.attributes.img_picture ?
    system.plant.relationships.plant_type.data.attributes.img_picture :
    '/images/generic-plant.jpg';

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
        <title>Plant detail</title>
        <meta name='og:title' content={'siteTitle'} />
        <meta name='twitter:card' content='summary_large_image' />
      </Head>      
      {
        props.plant ?
        <>
          <Grid marginTop={2}>
            <Grid item xs={3}>
              <Card sx={{ minWidth: 275 }} elevation={3}>
                <CardMedia
                    sx={{ height: 200 }}
                    image={img}
                    title={system.plant.attributes.name} />
                <CardContent>
                  <Typography
                    marginTop={3}
                    variant='subtitle1'
                    color={system.darkMode ? 'primary.contrastText' : ''}>
                    Plant Detail: {props.plant.attributes.name}
                    {props.plant.relationships.plant_type.data.attributes.name}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
          {
          system.measurements && system.measurements.length ?
            <MeasurementTable {...system} /> : null
          }
        </> : null
      }
    </MainLayout>
  )
};

export async function getServerSideProps({ req, params }: any) {
  const cookies = req.cookies;
  const env = GetEnvVariables() as EnvironmentVariables;
  let user = null;
  const cachedValues: CachedValues = GetCookieCachedValues(cookies);
  let plant;
  let measurements: Array<MeasurementInterface> = [];
  const slug = params.slug || null
  try {
    user = await GetUserFromCookie(cookies) as UserInterface;
    if (slug) {
      plant = await GetPlantBySlug({URLBase: env.URLBase, slug}) as PlantInterface;
      
    }
    if (plant) {
      measurements = await GetPlantMeasurements({URLBase: env.URLBase, id: plant.id}) as Array<MeasurementInterface>;
    }
  } catch (error) {
    
  }
  const props: System = {
    ...SystemInitalState,
    ...env,
    ...cachedValues,
    language: cachedValues.language ? cachedValues.language : env.defaultLanguage as Languages,
    user,
    plant: plant ? plant as PlantInterface : null,
    measurements
  };
  return {props};
};

export default PlantDetail;
