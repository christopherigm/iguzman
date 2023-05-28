import {ReactElement} from 'react';
import type PlantInterface from 'interfaces/plant-interface';
import {
  HourParser12Format,
  ShortDateParser,
} from 'utils';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardMedia from '@mui/material/CardMedia';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Link from 'next/link';

interface SensorDataItemInterface {
  label: string;
  value: string;
}

const SensorDataItem = ({label, value}: SensorDataItemInterface): ReactElement => {
  return (
    <Grid item xs={3}>
      <Typography variant='body2' align='center'>{label}</Typography>
      <Typography variant='body2' align='center'>{value}</Typography>
    </Grid>
  )
};

const Item = (props: PlantInterface): ReactElement => {
  const img = props.attributes.img_picture ?
    props.attributes.img_picture :
    props.relationships.plant_type.data &&
    props.relationships.plant_type.data.attributes.img_picture ?
    props.relationships.plant_type.data.attributes.img_picture :
    '/images/generic-plant.jpg';
  
  const getLocalDateFormat = (d: string): string => {
    let date = `${ShortDateParser(d, true).split(',')[0]}  ${HourParser12Format(d)}`; 
    return date;
  };
  
  return (
    <Grid item xs={12} sm={6} md={4} lg={3}>
      <Link
        href={`/plant/${props.attributes.slug}/`}
        passHref>
      <Card sx={{ minWidth: 275 }} elevation={3}>
        <CardMedia
            sx={{ height: 200 }}
            image={img}
            title={props.attributes.name} />
        <CardContent>
          <Typography variant='body1' align='center'>
            {props.attributes.name}
          </Typography>
          {
            props.attributes.last_measurement ?
            <>
              <Grid container spacing={2} marginTop={0}>
                <SensorDataItem
                  label='Soil'
                  value={`${props.attributes.last_measurement.soil_moisture}%`} />
                <SensorDataItem
                  label='Humid.'
                  value={`${props.attributes.last_measurement.humidity}%`} />
                <SensorDataItem
                  label='Temp.'
                  value={`${props.attributes.last_measurement.temperature} °C`} />
                <SensorDataItem
                  label='Light'
                  value={`${props.attributes.last_measurement.ldr}%`} />
              </Grid>
              {
                props.attributes.last_measurement.created ?
                  <Typography align='left' variant='body2' marginTop={2}>
                    Last update: {getLocalDateFormat(props.attributes.last_measurement.created)} 
                  </Typography> : null
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
  plants: Array<PlantInterface>
}

const PlantsGrid = ({plants}: Interface): ReactElement => {
  return (
    <Grid
      container spacing={2}
      marginTop={0}
      marginBottom={2}>
      {
        plants.map((i: PlantInterface, index: number) => {
          return (
              <Item {...i} 
              key={index}/>
          );
        })
      }
    </Grid>
  );
};

export default PlantsGrid;
