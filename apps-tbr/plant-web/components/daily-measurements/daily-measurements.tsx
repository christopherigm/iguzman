import React, {
  ReactElement,
  useState,
  useEffect,
} from 'react';
import type DailyMeasurementsInterface from 'interfaces/daily-measurements-interface';
import getLocalDayDateFormat from 'local-utils/get-local-day-date-format';
import GetDailyMeasurements from 'local-utils/get-daily-measurements';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import {Chart} from 'react-chartjs-2';
import Select, {
  SelectChangeEvent
} from '@mui/material/Select';
// https://apexcharts.com/docs/react-charts/ <- explore this

type Props = {
  URLBase: string;
  plantID: number;
  darkMode: boolean;
}

const DailyMeasurements = ({
    URLBase,
    plantID,
    darkMode,
  }: Props): ReactElement => {
  const [sizeOfSample, setSizeOfSample] = useState<number>(5);
  const [prevSizeOfSample, setPrevSizeOfSample] = useState<number>(5);
  const [labels, setLabels] = useState<Array<string>>([]);
  const [measurements, setMeasurements] = useState<Array<DailyMeasurementsInterface>>([]);
  const [minValues, setMinValues] = useState<Array<number>>([]);
  const [maxValues, setMaxValues] = useState<Array<number>>([]);
  const [minMeasurements, setMinMeasurements] = useState<Array<number>>([]);
  const [averageMeasurements, setAverageMeasurements] = useState<Array<number>>([]);
  const [maxMeasurements, setMaxMeasurements] = useState<Array<number>>([]);
  const typeOfMeasurements = [
    'Soil Mositure',
    '% of light',
    '% of humidity',
    'Temperature',
    'CPU temperature',
    'Hours of light'
  ]
  const [selection, setSelection] = useState<string>(typeOfMeasurements[0]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  useEffect(() => {
    if (sizeOfSample !== prevSizeOfSample || !measurements.length) {
      setPrevSizeOfSample(_p => sizeOfSample);
      setIsLoading(_p => true);
      GetDailyMeasurements({
        URLBase,
        plantID,
        pageSize: sizeOfSample
      })
        .then((data: Array<DailyMeasurementsInterface>) => {
          setMeasurements(_p => data);
        })
        .catch((err) => {
          console.log('err', err);
        })
        .finally(() => {
          setIsLoading(_p => false);
        });
      } else {
        const arrayCopy: Array<DailyMeasurementsInterface> = JSON.parse(JSON.stringify(measurements)).reverse();
        switch (selection) {
          case 'Soil Mositure':
              setMinValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.min_soil_humidity);
              }));
              setMaxValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.max_soil_humidity);
              }));
              setMinMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.min_soil_moisture);
              }));
              setAverageMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.average_soil_moisture);
              }));
              setMaxMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.max_soil_moisture);
              }));
            break;
          case '% of light':
              setMinValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.min_light_value);
              }));
              setMaxValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.max_light_value);
              }));
              setMinMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.min_ldr);
              }));
              setAverageMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.average_ldr);
              }));
              setMaxMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.max_ldr);
              }));
            break;
          case '% of humidity':
              setMinValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.min_ambient_humidity);
              }));
              setMaxValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.max_ambient_humidity);
              }));
              setMinMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.min_humidity);
              }));
              setAverageMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.average_humidity);
              }));
              setMaxMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.max_humidity);
              }));
            break;
          case 'Temperature':
              setMinValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.min_ambient_temperature);
              }));
              setMaxValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.max_ambient_temperature);
              }));
              setMinMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.min_temperature);
              }));
              setAverageMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.average_temperature);
              }));
              setMaxMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.max_temperature);
              }));
            break;
          case 'CPU temperature':
              setMinValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_controller.data.relationships.plant_controller_type.data.attributes.min_cpu_temperature);
              }));
              setMaxValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_controller.data.relationships.plant_controller_type.data.attributes.max_cpu_temperature);
              }));
              setMinMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.min_cpu_temperature);
              }));
              setAverageMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.average_cpu_temperature);
              }));
              setMaxMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.max_cpu_temperature);
              }));
            break;
          case 'Hours of light':
              setMinValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.min_hours_of_direct_light);
              }));
              setMaxValues(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.relationships.plant.data.relationships.plant_type.data.attributes.max_hours_of_direct_light);
              }));
              setMinMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return 0;
              }));
              setAverageMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return Number(i.attributes.hours_of_direct_light);
              }));
              setMaxMeasurements(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
                return 0;
              }));
            break;
          default:
            break;
        }
        setLabels(_p => arrayCopy.map((i: DailyMeasurementsInterface) => {
          return getLocalDayDateFormat(i.attributes.created);
        }));
      }
  }, [URLBase, measurements, plantID, prevSizeOfSample, selection, sizeOfSample]);
  
  const data = {
    labels: labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Min value',
        data: minValues,
        backgroundColor: '#ff9800',
        borderColor: '#ff9800',
        borderWidth: 2
      },
      {
        type: 'line' as const,
        label: 'Max value',
        data: maxValues,
        backgroundColor: '#f44336',
        borderColor: '#f44336',
        borderWidth: 2
      },
      {
        type: 'bar' as const,
        label: `Minimum ${selection}`,
        data: minMeasurements,
        backgroundColor: '#42a5f5',
        borderColor: '#2196f3',
        borderWidth: 2
      },
      {
        type: 'bar' as const,
        label: `Average ${selection}`,
        data: averageMeasurements,
        backgroundColor: '#66bb6a',
        borderColor: '#4caf50',
        borderWidth: 2
      },
      {
        type: 'bar' as const,
        label: `Maximum ${selection}`,
        data: maxMeasurements,
        backgroundColor: '#7e57c2',
        borderColor: '#673ab7',
        borderWidth: 2
      },
    ]
  };
  
  return (
    <>
      <Typography
        marginTop={5}
        variant='h6'
        color={darkMode ? 'primary.contrastText' : ''}>
        Daily Statistics
      </Typography>
      <Box
        marginTop={2}
        marginBottom={1}
        display='flex'
        justifyContent='left'>
        <FormControl size='small'>
          <InputLabel>Days</InputLabel>
          <Select
            value={sizeOfSample.toString()}
            label='Days'
            onChange={(event: SelectChangeEvent) => {
              setSizeOfSample(_p => Number(event.target.value));
            }}
            disabled={isLoading}>
            {
              [3, 5,10,15,20,25,30,35,40].map((i: number, index: number) => {
                return <MenuItem value={i} key={index}>{i} days</MenuItem>
              })
            }
          </Select>
        </FormControl>
      </Box>
      <Box
        marginTop={1}
        marginBottom={3}
        sx={{
          opacity: isLoading ? '0.4' : '1'
        }}>
        <Chart
          type='bar'
          data={data}
          width='100%'
          height={450}
          options={{
            maintainAspectRatio: false
          }} />
      </Box>
      <Box
        display='flex'
        justifyContent='center'
        flexWrap='wrap'>
        {
          typeOfMeasurements.map((i: string, index: number) => {
            return (
              <Button
                key={index}
                color={selection === i ? 'primary' : 'inherit'}
                size='small'
                variant='contained'
                sx={{
                  textTransform: 'unset',
                  margin: '0 5px 15px',
                }}
                onClick={() => setSelection(_p => i)}>{i}</Button>
            )
          })
        }
      </Box>
    </>
  );
};

export default DailyMeasurements;
