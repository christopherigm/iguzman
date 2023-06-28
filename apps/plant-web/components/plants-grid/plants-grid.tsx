import {ReactElement} from 'react';
import type PlantInterface from 'interfaces/plant-interface';
import {
  HourParser12Format,
  ShortDateParser,
} from 'utils';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import GenericImage from 'components/generic-image';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Link from 'next/link';
import PlantStatusItem from 'components/plant-status-item';

import WbSunnyIcon from '@mui/icons-material/WbSunny';
import Brightness6Icon from '@mui/icons-material/Brightness6';
import OpacityIcon from '@mui/icons-material/Opacity';
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat';
import WavesSharpIcon from '@mui/icons-material/WavesSharp';
import MemoryIcon from '@mui/icons-material/Memory';

type ItemProps = {
  plant: PlantInterface;
  darkMode: boolean;
}

const Item = ({
    plant,
    darkMode
  }: ItemProps): ReactElement => {
  if (!plant ||
    !plant.relationships.plant_type.data ||
    !plant.relationships.plant_type.data.id) return <></>;
  const plantType = plant.relationships.plant_type.data;
  const img = plant.attributes.img_picture ?
    plant.attributes.img_picture :
    plant.relationships.plant_type.data &&
    plant.relationships.plant_type.data.attributes.img_picture ?
    plant.relationships.plant_type.data.attributes.img_picture :
    '/images/generic-plant.jpg';
  const plantControllerType = plant.relationships.plant_controller.data.relationships.plant_controller_type.data;
  const soilMoisture = plant.attributes.last_measurement.soil_moisture;
  const ldr = plant.attributes.last_measurement.ldr;
  const temperature = plant.attributes.last_measurement.temperature;
  const humidity = plant.attributes.last_measurement.humidity;
  const cpuTemperature = plant.attributes.last_measurement.cpu_temperature;
  const isDay = plant.attributes.last_measurement.is_day;
  const computedHoursOfDirectLight = plant.attributes.last_measurement.computed_hours_of_direct_light;
  
  const getLocalDateFormat = (d: string): string => {
    let date = `${ShortDateParser(d, true).split(',')[0]}  ${HourParser12Format(d)}`; 
    return date;
  };

  
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Link
        href={`/plant/${plant.attributes.slug}/`}
        passHref>
      <Card sx={{ minWidth: 275 }} elevation={2}>
        <GenericImage
          src={img}
          alt={plant.attributes.name} />
        {/* <CardMedia
          sx={{
            height: {
              xs: 350,
              md: 400
            }
          }}
          image={img}
          title={plant.attributes.name} /> */}
        <CardContent sx={{
          paddingBottom: '10px !important;'
        }}>
          <Typography
            variant='subtitle1'
            align='center'
            fontWeight='bold'
            noWrap>
            {plant.attributes.name}
          </Typography>
          {
            plant.attributes.last_measurement ?
            <>
              <Box
                marginTop={1}
                marginBottom={0}>
                <Divider />
              </Box>
              <Grid
                container
                marginBottom={2}
                rowSpacing={2}
                columnSpacing={1.5}
                marginTop={0}>
                <Grid item xs={4}>
                  <PlantStatusItem
                    value={soilMoisture}
                    unit='%'
                    min={plantType.attributes.min_soil_humidity}
                    max={plantType.attributes.max_soil_humidity}
                    label='Soil moisture'
                    icon={<OpacityIcon />}
                    darkMode={darkMode}
                    isDisabled={false}
                    detailEnabled={false}
                    displayLabel={false} />
                </Grid>
                <Grid item xs={4}>
                  <PlantStatusItem
                    value={ldr}
                    unit='%'
                    min={plantType.attributes.min_light_value}
                    max={plantType.attributes.max_light_value}
                    label='Sun light'
                    icon={<WbSunnyIcon />}
                    darkMode={darkMode}
                    isDisabled={!isDay}
                    detailEnabled={false}
                    displayLabel={false} />
                </Grid>
                <Grid item xs={4}>
                  <PlantStatusItem
                    value={computedHoursOfDirectLight}
                    unit=' hrs.'
                    min={plantType.attributes.min_hours_of_direct_light}
                    max={plantType.attributes.max_hours_of_direct_light}
                    label='Hours of sun'
                    icon={<Brightness6Icon />}
                    darkMode={darkMode}
                    isDisabled={!isDay}
                    detailEnabled={false}
                    displayLabel={false} />
                </Grid>
                <Grid item xs={4}>
                  <PlantStatusItem
                    value={humidity}
                    unit='%'
                    min={plantType.attributes.min_ambient_humidity}
                    max={plantType.attributes.max_ambient_humidity}
                    label='Ambient humidity'
                    icon={<WavesSharpIcon />}
                    darkMode={darkMode}
                    isDisabled={false}
                    detailEnabled={false}
                    displayLabel={false} />
                </Grid>
                <Grid item xs={4}>
                  <PlantStatusItem
                    value={temperature}
                    unit='°C'
                    min={plantType.attributes.min_ambient_temperature}
                    max={plantType.attributes.max_ambient_temperature}
                    label='Temperature'
                    icon={<DeviceThermostatIcon />}
                    darkMode={darkMode}
                    isDisabled={false}
                    detailEnabled={false}
                    displayLabel={false} />
                </Grid>
                <Grid item xs={4}>
                  <PlantStatusItem
                    value={cpuTemperature}
                    unit='°C'
                    min={plantControllerType.attributes.min_cpu_temperature}
                    max={plantControllerType.attributes.max_cpu_temperature}
                    label='CPU temperature'
                    icon={<MemoryIcon />}
                    darkMode={darkMode}
                    isDisabled={false}
                    detailEnabled={false}
                    displayLabel={false} />
                </Grid>
              </Grid>
              <Divider />
              {
                plant.attributes.last_measurement.created ?
                  <Box
                    display='flex'
                    justifyContent='end'>
                    <Typography align='left' variant='body2' marginTop={1}>
                      Last update: {
                        getLocalDateFormat(plant.attributes.last_measurement.created)
                      } 
                    </Typography>
                  </Box> : null
              }
            </> : null
          }
        </CardContent>
      </Card>
      </Link>
    </Grid>
  )
};

interface Interface {
  plants: Array<PlantInterface>;
  darkMode: boolean;
}

const PlantsGrid = ({
    plants,
    darkMode
  }: Interface): ReactElement => {
  return (
    <Grid
      container
      rowSpacing={2}
      columnSpacing={4}
      marginTop={0}
      marginBottom={2}>
      {
        plants.map((i: PlantInterface, index: number) => {
          return (
            <Item
              plant={i} 
              darkMode={darkMode} 
              key={index}/>
          );
        })
      }
    </Grid>
  );
};

export default PlantsGrid;
