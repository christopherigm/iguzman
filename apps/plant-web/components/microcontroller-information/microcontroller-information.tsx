import {ReactElement} from 'react';
import {FormatNum} from 'utils';
import type {
  PLantControllerInterface,
  PLantControllerTypeInterface
} from 'interfaces/plant-interface';
import GenericImage from 'components/generic-image';
import GenericProperty from 'components/generic-property';
import getLocalDateFormat from 'local-utils/get-local-date-format';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import {Pie} from 'react-chartjs-2';

interface PlantPropertyProps {
  lastUpdate: string;
  plantController: PLantControllerInterface;
  plantControllerType: PLantControllerTypeInterface;
  darkMode: boolean;
}

const MicroControllerInformation = ({
    lastUpdate,
    plantController,
    plantControllerType,
    darkMode,
  }: PlantPropertyProps): ReactElement => {
  const totalStorageCapacity = plantControllerType.attributes.total_storage_capacity;
  const storageAllocated = plantController.attributes.storage_allocated;
  const storageAvailable = totalStorageCapacity - storageAllocated;

  const totalRAMCapacity = plantControllerType.attributes.total_ram_capacity;
  const ramAllocated = plantController.attributes.ram_allocated;
  const ramAvailable = totalRAMCapacity - ramAllocated;

  const backgroundColor = [
    '#bbb',
    'green',
  ];

  const storageData = {
    labels: [
      `Available: ${FormatNum(storageAvailable)} KB`,
      `Allocated: ${FormatNum(storageAllocated)} KB`,
    ],
    datasets: [{
      label: 'Storage',
      data: [storageAvailable, storageAllocated],
      backgroundColor: backgroundColor,
      hoverOffset: 8
    }]
  };

  const ramData = {
    labels: [
      `Available: ${FormatNum(ramAvailable)} KB`,
      `Allocated: ${FormatNum(ramAllocated)} KB`,
    ],
    datasets: [{
      label: 'RAM',
      data: [ramAvailable, ramAllocated],
      backgroundColor: backgroundColor,
      hoverOffset: 8
    }]
  };

  return (
    <>
    <Typography
      marginTop={5}
      variant='h6'
      color={darkMode ? 'primary.contrastText' : ''}>
      Microcontroller information
    </Typography>
    <Grid
      container
      marginTop={-0.5}
      marginBottom={3}
      columnSpacing={3}
      rowSpacing={3}>
      <Grid item xs={12} sm={12} md={4}>
        <GenericImage
          src={plantController.attributes.img_picture ?? '/images/generic-controller.png'}
          alt={plantController.attributes.name} />
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <Paper elevation={1}>
          <Box padding={2}>
            <Typography
              marginBottom={1}
              variant='subtitle1'
              color={darkMode ? 'primary.contrastText' : ''}>
              <b>Specs</b>
            </Typography>
            <Divider />
            <GenericProperty
              label='Name'
              value={plantController.attributes.name}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <Divider />
            <GenericProperty
              label='Total storage capacity'
              value={`${FormatNum(totalStorageCapacity)} KB`}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <GenericProperty
              label='Storage allocated'
              value={`${FormatNum(storageAllocated)} KB`}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <GenericProperty
              label='Storage available'
              value={`${FormatNum(storageAvailable)} KB`}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <Divider />
            <GenericProperty
              label='Total RAM capacity'
              value={`${FormatNum(totalRAMCapacity)} KB`}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <GenericProperty
              label='RAM allocated'
              value={`${FormatNum(ramAllocated)} KB`}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <GenericProperty
              label='RAM available'
              value={`${FormatNum(ramAvailable)} KB`}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <Divider />
            <GenericProperty
              label='Min CPU temperature'
              value={`${FormatNum(plantControllerType.attributes.min_cpu_temperature)} °C`}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <GenericProperty
              label='Max CPU temperature'
              value={`${FormatNum(plantControllerType.attributes.max_cpu_temperature, false)} °C`}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <GenericProperty
              label='Current CPU temperature'
              value={`${FormatNum(plantController.attributes.cpu_temperature, false)} °C`}
              darkMode={darkMode}
              marginTop={1}
              marginBottom={1} />
            <Divider />
            <Box marginTop={1.5} display='flex' justifyContent='end'>
              <Typography
                variant='caption'
                color={darkMode ? 'primary.contrastText' : ''}
                textAlign='right'>
                Last update: {getLocalDateFormat(lastUpdate)}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <Typography
          variant='body1'
          color={darkMode ? 'primary.contrastText' : ''}
          textAlign='left'>
          Storage capacity: {`${FormatNum(totalStorageCapacity)} KB`}
        </Typography>
        <Box marginTop={1} marginBottom={1}>
          <Divider />
        </Box>
        <Box height='190px'>
          <Pie
            data={storageData}
            width='100%'
            height='100%'
            options={{
              maintainAspectRatio: false
            }} />
        </Box>
        
        <Box marginTop={3}>
          <Typography
            variant='body1'
            color={darkMode ? 'primary.contrastText' : ''}
            textAlign='left'>
            RAM capacity: {`${FormatNum(totalRAMCapacity)} KB`}
          </Typography>
        </Box>
        <Box marginTop={1} marginBottom={1}>
          <Divider />
        </Box>
        <Box height='190px'>
          <Pie
            data={ramData}
            width='100%'
            height='100%'
            options={{
              maintainAspectRatio: false
            }} />
        </Box>
      </Grid>
    </Grid>
    </>
  );
};

export default MicroControllerInformation;
