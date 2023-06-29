import {
  ReactElement,
  useEffect,
  useState,
  useCallback,
} from 'react';
import Head from 'next/head';
import {
  GetUserFromCookie,
  GetCookieCachedValues,
  GetEnvVariables,
  ReplaceURLBase,
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
import GetPlantBySlug from 'local-utils/get-plant-by-slug';
import PlantDetailHeader from 'components/plant-detail-header';
import Measurements from 'components/measurements';
import DailyMeasurements from 'components/daily-measurements';
import MicroControllerInformation from 'components/microcontroller-information';
import Typography from '@mui/material/Typography';
import { Button } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import Link from 'next/link';

const PlantDetail = (props: System): ReactElement => {
  const [system, updateSystem] = useState<System>(props);
  const setSystem = (s: System): void => updateSystem(_s => s);
  const [plantIntervalToUpdate, setPlantIntervalToUpdate] = useState(0);
  const [minToUpdate, setMinToUpdate] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [nextUpdate, setNextUpdate] = useState(0);
  const [minSinceLastUpdate, setMinSinceLastUpdate] = useState(0);
  const [renderTime, setRenderTime] = useState(0);
  const [fechingData, setFechingData] = useState(false);

  const fetchPlantData = useCallback(() => {
    if (fechingData) return;
    setFechingData(_p => true);
    GetPlantBySlug({
      URLBase: system.URLBase,
      slug: system.plant?.attributes.slug || ''
    })
      .then((plant: PlantInterface) => {
        updateSystem(_p => {
          return {
            ..._p,
            plant
          };
        });
    })
      .catch((err) => console.log(err))
      .finally(() => setFechingData(_p => false));
  }, [system, fechingData]);

  const setDates = useCallback(() => {
    const plant = system.plant;
    if (plant) {
      const now = Date.now();
      const minutesSinceLastUpdate = ((now-lastUpdate)/1000)/60;
      setMinSinceLastUpdate(_p =>
        minutesSinceLastUpdate
      );
      let nextUpdates = Number(lastUpdate + (plantIntervalToUpdate*1000*60));
      if ( minutesSinceLastUpdate > plantIntervalToUpdate) {
        const minutesSinceLastUpdateFromRender = ((renderTime-lastUpdate)/1000)/60;
        nextUpdates = lastUpdate +
          (minutesSinceLastUpdateFromRender* 1000 * 60) +
          (plantIntervalToUpdate * 1000 * 60);
      }
      setNextUpdate(_p => nextUpdates);
      const minutesToUpdate = Math.round(((nextUpdates-now)/1000)/60);
      setMinToUpdate(_p =>
        minutesToUpdate < 0 ? plantIntervalToUpdate : minutesToUpdate
      );
    }
  }, [system.plant, lastUpdate, plantIntervalToUpdate, renderTime]);

  const periodicCheckout = useCallback(() => {
    const plant = system.plant;
    if (plant) {
      const now = Date.now();
      if (now >= nextUpdate) {
        // console.log('fetchPlantData................');
        // console.log('>>>>>> now:', new Date(now), now);
        // console.log('nextUpdate:', new Date(nextUpdate), nextUpdate);
        fetchPlantData();
      } else {
        setDates();
        // console.log('lastUpdate:', new Date(lastUpdate), lastUpdate);
        // console.log('>>>>>> now:', new Date(now), now);
        // console.log('nextUpdate:', new Date(nextUpdate), nextUpdate);
        // console.log('minToUpdat:', minToUpdate);
      }
    }
  }, [system.plant, nextUpdate, fetchPlantData, setDates]);

  useEffect(() => {
    // console.log('New Render');
    const plant = system.plant;
    if (plant) {
      setPlantIntervalToUpdate(_p =>
        plant.relationships.plant_type.data.attributes.minutes_to_upload_sensor_data + 1
      );
      setLastUpdate(_p => new Date(
        plant.attributes.last_measurement.created
      ).getTime());
      setRenderTime(_p => Date.now());
    }
    setDates();
    const timerRef = setInterval(() => {
      periodicCheckout();
    }, 10000);
    return () => clearInterval(timerRef);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    system.plant,
    minToUpdate,
  ]);

  if (!system.plant) {
    return(
      <>No data</>
    );
  }

  const setIsLoading = () => setSystem({
    ...system,
    isLoading: true
  });

  const Menu = (): ReactElement => {
    return (
      <Link
        href='/'
        onClick={setIsLoading}
        passHref>
        <Button
          size='large'
          startIcon={<HomeIcon />}
          sx={{
            color: '#444'
          }}
          disabled={system.isLoading}>Home</Button>
      </Link>
    )
  };

  return (
    <MainLayout
      system={system}
      setSystem={setSystem}
      menu={<Menu />}>
      <Head>
        <link rel='icon' href='/favicon.ico' />
        <meta
          name='description'
          content={
            system.plant && system.plant.id ?
              system.plant.attributes.name : 'Plant detail'
          }
        />
        <title>
        {
          system.plant && system.plant.id ?
            system.plant.attributes.name : 'Plant detail'
        }
        </title>
        <meta name='og:title' content={
          system.plant && system.plant.id ?
            system.plant.attributes.name : 'Plant detail'
        } />
        <meta name='twitter:card' content={
          system.plant && system.plant.id && system.plant.attributes.img_picture?
            system.plant.attributes.img_picture : ''
        } />
        <meta name='og:image' content={
          system.plant && system.plant.id && system.plant.attributes.img_picture?
            system.plant.attributes.img_picture : ''
        } />
      </Head>
      {
        system.plant &&
        system.plant.relationships &&
        system.plant.relationships.plant_type &&
        system.plant.relationships.plant_type.data &&
        system.plant.relationships.plant_type.data.id &&
        system.plant.relationships.plant_controller &&
        system.plant.relationships.plant_controller.data &&
        system.plant.relationships.plant_controller.data.id &&
        system.plant.relationships.plant_controller.data.relationships &&
        system.plant.relationships.plant_controller.data.relationships.plant_controller_type &&
        system.plant.relationships.plant_controller.data.relationships.plant_controller_type.data &&
        system.plant.relationships.plant_controller.data.relationships.plant_controller_type.data.id ?
        <>
          <PlantDetailHeader
            plant={system.plant}
            darkMode={system.darkMode}
            nextUpdate={new Date(nextUpdate).toString()}
            minToUpdate={minToUpdate}
            minSinceLastUpdate={minSinceLastUpdate} />
          <Measurements
            URLBase={system.URLBase}
            plantID={system.plant.id}
            darkMode={system.darkMode}
            minutesToUploadSensorData={Number(system.plant.relationships.plant_type.data.attributes.minutes_to_upload_sensor_data)}/>
          <DailyMeasurements
            URLBase={system.URLBase}
            plantID={system.plant.id}
            darkMode={system.darkMode} />
          <MicroControllerInformation
            lastUpdate={system.plant.attributes.last_measurement.created}
            plantController={system.plant.relationships.plant_controller.data}
            plantControllerType={system.plant.relationships.plant_controller.data.relationships.plant_controller_type.data}
            darkMode={system.darkMode} />
        </> :
        <Typography
          variant='subtitle1'
          color={system.darkMode ? 'primary.contrastText' : ''}>
          <b>Data not available:</b>
        </Typography>
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
  const slug = params.slug || null
  try {
    user = await GetUserFromCookie(cookies) as UserInterface;
    if (slug) {
      plant = await GetPlantBySlug({
        URLBase: env.hostName === 'localhost' ? env.URLBase : env.K8sURLBase,
        slug
      }) as PlantInterface;
    }
  } catch (error) {
    console.log('error', error);
  }
  if (env.hostName !== 'localhost') {
    plant=ReplaceURLBase(plant, env.K8sURLBase, env.URLBase) as PlantInterface;
  }
  const props: System = {
    ...SystemInitalState,
    ...env,
    ...cachedValues,
    language: cachedValues.language ? cachedValues.language : env.defaultLanguage as Languages,
    user,
    plant: plant ? plant as PlantInterface : null,
  };
  return {props};
};

export default PlantDetail;
