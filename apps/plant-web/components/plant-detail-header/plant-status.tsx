import {ReactElement, useEffect} from 'react';

import type PlantInterface from 'interfaces/plant-interface';

import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import WbSunnyIcon from '@mui/icons-material/WbSunny';
import Brightness6Icon from '@mui/icons-material/Brightness6';
import OpacityIcon from '@mui/icons-material/Opacity';
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat';
import WavesSharpIcon from '@mui/icons-material/WavesSharp';
import MemoryIcon from '@mui/icons-material/Memory';

import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';

import getLocalDateFormat from 'local-utils/get-local-date-format';

import PlantStatusItem from 'components/plant-status-item';

import {FormatNum} from 'utils';


interface PlantStatusProps {
  plant: PlantInterface;
  darkMode: boolean;
  nextUpdate: string;
  minToUpdate: number;
  minSinceLastUpdate: number;
  minutesToUploadSensorData: number;
}

const PlantStatus = ({
    plant,
    darkMode,
    nextUpdate,
    minToUpdate,
    minSinceLastUpdate,
    minutesToUploadSensorData
  }: PlantStatusProps): ReactElement => {
  const plantType = plant.relationships.plant_type.data;
  const plantController = plant.relationships.plant_controller.data;
  const plantControllerType = plant.relationships.plant_controller.data.relationships.plant_controller_type.data;
  const soilMoisture = plant.attributes.last_measurement.soil_moisture;
  const ldr = plant.attributes.last_measurement.ldr;
  const temperature = plant.attributes.last_measurement.temperature;
  const humidity = plant.attributes.last_measurement.humidity;
  const cpuTemperature = plant.attributes.last_measurement.cpu_temperature;
  const isDay = plant.attributes.last_measurement.is_day;
  const lastUpdate = plant.attributes.last_measurement.created;
  const computedHoursOfDirectLight = plant.attributes.last_measurement.computed_hours_of_direct_light;

  useEffect(() => {}, [minToUpdate, plant]);

  return (
    <Box>
      <Typography
        variant='subtitle1'
        color={darkMode ? 'primary.contrastText' : ''}>
        <b>Current status:</b>
      </Typography>
      <Box
        marginTop={-0.5}
        marginBottom={1}>
        <Typography
          variant='caption'
          color={darkMode ? 'primary.contrastText' : ''}
          fontStyle='italic'>
          Click items for details
        </Typography>
      </Box>
      <Divider />
      <Grid
        container
        marginTop={0}
        marginBottom={2}
        columnSpacing={1.5}
        rowSpacing={2}>
        <Grid item xs={6}>
          <PlantStatusItem
            value={soilMoisture}
            unit='%'
            min={plantType.attributes.min_soil_humidity}
            max={plantType.attributes.max_soil_humidity}
            label='Soil moisture'
            icon={<OpacityIcon />}
            darkMode={darkMode}
            isDisabled={false} />
        </Grid>
        <Grid item xs={6}>
          <PlantStatusItem
            value={ldr}
            unit='%'
            min={plantType.attributes.min_light_value}
            max={plantType.attributes.max_light_value}
            label='Sun light'
            icon={<WbSunnyIcon />}
            darkMode={darkMode}
            isDisabled={!isDay} />
        </Grid>
        <Grid item xs={6}>
          <PlantStatusItem
            value={computedHoursOfDirectLight}
            unit=' hrs.'
            min={plantType.attributes.min_hours_of_direct_light}
            max={plantType.attributes.max_hours_of_direct_light}
            label='Hours of sun'
            icon={<Brightness6Icon />}
            darkMode={darkMode}
            isDisabled={!isDay} />
        </Grid>
        <Grid item xs={6}>
          <PlantStatusItem
            value={humidity}
            unit='%'
            min={plantType.attributes.min_ambient_humidity}
            max={plantType.attributes.max_ambient_humidity}
            label='Ambient humidity'
            icon={<WavesSharpIcon />}
            darkMode={darkMode}
            isDisabled={false} />
        </Grid>
        <Grid item xs={6}>
          <PlantStatusItem
            value={temperature}
            unit='°C'
            min={plantType.attributes.min_ambient_temperature}
            max={plantType.attributes.max_ambient_temperature}
            label='Temperature'
            icon={<DeviceThermostatIcon />}
            darkMode={darkMode}
            isDisabled={false} />
        </Grid>
        <Grid item xs={6}>
          <PlantStatusItem
            value={cpuTemperature}
            unit='°C'
            min={plantControllerType.attributes.min_cpu_temperature}
            max={plantControllerType.attributes.max_cpu_temperature}
            label='CPU temperature'
            icon={<MemoryIcon />}
            darkMode={darkMode}
            isDisabled={false} />
        </Grid>
      </Grid>
      <Divider />
      <Box marginTop={0.5} display='flex' justifyContent='end'>
        <Typography
          variant='caption'
          color={darkMode ? 'primary.contrastText' : ''}
          textAlign='right'>
          {
            nextUpdate === '' ?
            <>
              Getting data for next update...
            </> :
              minToUpdate === 0 ?
              <>
                Updating data shortly...
              </> :
              nextUpdate !== '' ?
              <>
                Next update: {getLocalDateFormat(nextUpdate)}  (in {FormatNum(minToUpdate)} min.)
              </> : null
          }
        </Typography>
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <LinearProgress
          variant={minToUpdate === 0 ?
            'indeterminate' : 'determinate'}
          value={(100 - Math.round(((minToUpdate * 100) / (minutesToUploadSensorData + 1))))} />
      </Box>
      {/* <Box>Compute: {(100 - Math.round(((minToUpdate * 100) / (minutesToUploadSensorData + 1))))}</Box>
      <Box>minToUpdate: {minToUpdate}</Box>
      <Box>minutesToUploadSensorData: {minutesToUploadSensorData}</Box> */}
      <Box marginTop={1} display='flex' justifyContent='end'>
        <Typography
          variant='caption'
          color={darkMode ? 'primary.contrastText' : ''}
          textAlign='right'>
          Last update: {
            getLocalDateFormat(lastUpdate)
          }
          {
            minSinceLastUpdate !== 0 && minSinceLastUpdate < (minutesToUploadSensorData + 1)?
            <>
              {' '}({FormatNum(minSinceLastUpdate)} min. ago)
            </> : null
          }
        </Typography>
      </Box>
    </Box>
  );
};

export default PlantStatus;
