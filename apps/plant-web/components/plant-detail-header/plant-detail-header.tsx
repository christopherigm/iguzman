import {ReactElement} from 'react';

import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import getLocalDateFormat from 'local-utils/get-local-date-format';
import GenericImage from 'components/generic-image';

import PlantStatus from './plant-status';
import PlantTypeInformation from './plant-type-information';
import type PlantInterface from 'interfaces/plant-interface';

type Props = {
  plant: PlantInterface;
  darkMode: boolean;
  nextUpdate: string;
  minToUpdate: number;
  minSinceLastUpdate: number;
}

const PlantDetailHeader = ({
    plant,
    darkMode,
    nextUpdate,
    minToUpdate,
    minSinceLastUpdate,
  }: Props): ReactElement => {

  const img = plant.attributes.img_picture ??
    plant.relationships.plant_type.data.attributes.img_picture ??
    '/images/generic-plant.jpg';
  
  return (
    <Box>
      <Typography
        marginTop={3}
        variant='h4'
        color={darkMode ? 'primary.contrastText' : ''}>
        {plant.attributes.name}
      </Typography>
      <Typography
        marginTop={0}
        variant='subtitle1'
        color={darkMode ? 'primary.contrastText' : ''}
        fontStyle='italic'>
        {plant.relationships.plant_type.data.attributes.name}
        {' - '} Last update: {getLocalDateFormat(
          plant.attributes.last_measurement.created
        )}
      </Typography>
      <Grid
        container
        marginTop={0}
        marginBottom={3}
        columnSpacing={3}
        rowSpacing={3}>
        <Grid item xs={12} sm={12} md={4}>
          <GenericImage
            src={img}
            alt={plant.relationships.plant_type.data.attributes.name} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <PlantStatus
            plant={plant}
            darkMode={darkMode}
            nextUpdate={nextUpdate}
            minToUpdate={minToUpdate}
            minSinceLastUpdate={minSinceLastUpdate}
            minutesToUploadSensorData={Number(plant.relationships.plant_type.data.attributes.minutes_to_upload_sensor_data)} />
        </Grid>
        {
          plant.relationships.plant_type.data &&
          plant.relationships.plant_type.data.id ?
          <Grid item xs={12} sm={6} md={4}>
            <PlantTypeInformation
              plantType={plant.relationships.plant_type.data}
              plantControllerType={plant.relationships.plant_controller.data.relationships.plant_controller_type.data}
              darkMode={darkMode} />
          </Grid> : null
        }
      </Grid>
    </Box>
  );
};

export default PlantDetailHeader;
