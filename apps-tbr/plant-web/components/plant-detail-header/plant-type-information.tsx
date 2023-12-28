import {ReactElement} from 'react';

import type {
  PLantControllerTypeInterface,
  PLantTypeInterface,
} from 'interfaces/plant-interface';
import GenericProperty from 'components/generic-property';

import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';

interface PlantTypeInformationProps {
  plantType: PLantTypeInterface;
  plantControllerType: PLantControllerTypeInterface;
  darkMode: boolean;
}

const PlantTypeInformation = ({
    plantType,
    plantControllerType,
    darkMode
  }: PlantTypeInformationProps): ReactElement => {
  return (
    <Paper elevation={1}>
      <Box padding={2}>
        <Typography
          marginBottom={1}
          variant='subtitle1'
          color={darkMode ? 'primary.contrastText' : ''}>
          <b>Plant information</b>
        </Typography>
        <Divider />
        <GenericProperty
          label='Plant type'
          value={plantType.attributes.name}
          darkMode={darkMode}
          marginTop={1}
          marginBottom={1} />
        <Divider />
        <GenericProperty
          label='Soil moisture'
          value={`
            Between ${plantType.attributes.min_soil_humidity}% and
            ${plantType.attributes.max_soil_humidity}%`}
          darkMode={darkMode}
          marginTop={1}
          marginBottom={1} />
        <Divider />
        <GenericProperty
          label='Percentage of sun light'
          value={`
            Between ${plantType.attributes.min_light_value}% and 
            ${plantType.attributes.max_light_value}%
          `}
          darkMode={darkMode}
          marginTop={1}
          marginBottom={1} />
        <Divider />
        <GenericProperty
          label='Hours of direct sun light'
          value={`
            Between ${plantType.attributes.min_hours_of_direct_light} and
            ${plantType.attributes.max_hours_of_direct_light} hours a day
          `}
          darkMode={darkMode}
          marginTop={1}
          marginBottom={1} />
        <Divider />
        <GenericProperty
          label='Percentage of ambient humidity'
          value={`
            Between ${plantType.attributes.min_ambient_humidity}% and
            ${plantType.attributes.max_ambient_humidity}%
          `}
          darkMode={darkMode}
          marginTop={1}
          marginBottom={1} />
        <Divider />
        <GenericProperty
          label='Ideal temperature'
          value={`
            Between ${plantType.attributes.min_ambient_temperature}°C and 
            ${plantType.attributes.max_ambient_temperature}°C
          `}
          darkMode={darkMode}
          marginTop={1}
          marginBottom={1} />
        <Divider />
        <GenericProperty
          label='Interval to update data'
          value={`Every ~${plantType.attributes.minutes_to_upload_sensor_data} minutes`}
          darkMode={darkMode}
          marginTop={1}
          marginBottom={1} />
        <Divider />
        <GenericProperty
          label='Controller type'
          value={plantControllerType.attributes.name}
          darkMode={darkMode}
          marginTop={1} />
      </Box>
    </Paper>
  );
};

export default PlantTypeInformation;
