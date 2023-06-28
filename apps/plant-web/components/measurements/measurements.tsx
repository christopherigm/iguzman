import {
  ReactElement,
  useEffect,
  useState
} from 'react';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {Line} from 'react-chartjs-2';

import type MeasurementInterface from 'interfaces/measurement-interface';
import getLocalDateFormat from 'local-utils/get-local-date-format';
import GetPlantMeasurements from 'local-utils/get-plant-measurements';

import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, {
  SelectChangeEvent
} from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import LinearProgress from '@mui/material/LinearProgress';
import { Mark } from '@mui/base/SliderUnstyled';
import {HourParser12Format} from 'utils';

const getMarks = (limit = 90, steps = 10): Array<Mark> => {
  const marks: Array<Mark> = [];
  for (let i = 0; i <= limit; i+=steps) {
    marks.push({
      value: i,
      label: i.toString(),
    });
  }
  return marks;
};

type Props = {
  URLBase: string;
  plantID: number;
  darkMode: boolean;
  minutesToUploadSensorData: number;
}

const Measurements = ({
    URLBase,
    plantID,
    darkMode,
    minutesToUploadSensorData
  }: Props): ReactElement => {
  const minSizeOfSample = 10;
  const maxSizeOfSample = 90;
  const stepOfSample = 10;
  const defaultSizeOfSample = 30;
  const marks: Array<Mark> = getMarks(maxSizeOfSample, stepOfSample);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resolution, setResolution] = useState<number>(minutesToUploadSensorData);
  const [prevSizeOfSample, setPrevSizeOfSample] = useState<number>(defaultSizeOfSample);
  const [sizeOfSample, setSizeOfSample] = useState<number>(defaultSizeOfSample);

  const [measurements, setMeasurements] = useState<Array<MeasurementInterface>>([]);
  const [labels, setLabels] = useState<Array<string>>([]);
  const [soilMoistureMeasurements, setSoilMoistureMeasurements] = useState<Array<number>>([]);
  const [ldrMeasurements, setLDRMeasurements] = useState<Array<number>>([]);
  const [humidityMeasurements, setHumidityMeasurements] = useState<Array<number>>([]);
  const [temperatureMeasurements, setTemperatureMeasurements] = useState<Array<number>>([]);
  const [cpuTemperatureMeasurements, setCPUTemperatureMeasurements] = useState<Array<number>>([]);
  
  useEffect(() => {
    if (sizeOfSample !== prevSizeOfSample || !measurements.length) {
      setPrevSizeOfSample(_p => sizeOfSample);
      setIsLoading(_p => true);
      GetPlantMeasurements({
        URLBase,
        plantID,
        pageSize: sizeOfSample
      })
        .then((data: Array<MeasurementInterface>) => {
          setMeasurements(_p => data);
        })
        .catch((err) => {
          console.log('err', err);
        })
        .finally(() => {
          setIsLoading(_p => false);
        });
    }
    if (measurements.length) {
      const ratio = resolution / minutesToUploadSensorData;
      const arrayCopy: Array<MeasurementInterface> = JSON.parse(JSON.stringify(measurements)).reverse();
      const newM: Array<MeasurementInterface> = [];
      for (let i = 0; i < arrayCopy.length; i++) {
        const index = i * ratio;
        if (arrayCopy[index]) {
          const newObj: MeasurementInterface = arrayCopy[index];
          newObj.attributes.soil_moisture = Number(newObj.attributes.soil_moisture);
          newObj.attributes.ldr = Number(newObj.attributes.ldr);
          newObj.attributes.humidity = Number(newObj.attributes.humidity);
          newObj.attributes.temperature = Number(newObj.attributes.temperature);
          newObj.attributes.cpu_temperature = Number(newObj.attributes.cpu_temperature);
          for (let j = index + 1; j < index + ratio; j++) {
            if (arrayCopy[j]) {
              newObj.attributes.soil_moisture += Number(arrayCopy[j].attributes.soil_moisture);
              newObj.attributes.ldr += Number(arrayCopy[j].attributes.ldr);
              newObj.attributes.humidity += Number(arrayCopy[j].attributes.humidity);
              newObj.attributes.temperature += Number(arrayCopy[j].attributes.temperature);
              newObj.attributes.cpu_temperature += Number(arrayCopy[j].attributes.cpu_temperature);
            }
          }
          newObj.attributes.soil_moisture = Number((newObj.attributes.soil_moisture / ratio));
          newObj.attributes.ldr = Number((newObj.attributes.ldr / ratio));
          newObj.attributes.humidity = Number((newObj.attributes.humidity / ratio));
          newObj.attributes.temperature = Number((newObj.attributes.temperature / ratio));
          newObj.attributes.cpu_temperature = Number((newObj.attributes.cpu_temperature / ratio));
          newM.push(newObj);
        }
      }
      if (ratio !== 1 ) {
        newM.pop();
      }
      setLabels(_p => newM.map((i: MeasurementInterface) => {
        return getLocalDateFormat(i.attributes.created);
      }));
      setSoilMoistureMeasurements(_p => newM.map((i: MeasurementInterface) => {
        return i.attributes.soil_moisture;
      }));
      setLDRMeasurements(_p => newM.map((i: MeasurementInterface) => {
        return i.attributes.ldr;
      }));
      setHumidityMeasurements(_p => newM.map((i: MeasurementInterface) => {
        return i.attributes.humidity;
      }));
      setTemperatureMeasurements(_p => newM.map((i: MeasurementInterface) => {
        return i.attributes.temperature;
      }));
      setCPUTemperatureMeasurements(_p => newM.map((i: MeasurementInterface) => {
        return i.attributes.cpu_temperature;
      }));
    }
  }, [
    URLBase,
    plantID,
    setLabels,
    measurements,
    setSoilMoistureMeasurements,
    setLDRMeasurements,
    setHumidityMeasurements,
    setTemperatureMeasurements,
    setCPUTemperatureMeasurements,
    resolution,
    sizeOfSample,
    prevSizeOfSample,
    minutesToUploadSensorData,
  ]);

  const data = {
    labels: labels,
    datasets: [
      {
        label: 'Soil Moisture',
        data: soilMoistureMeasurements,
        borderColor: 'blue',
        backgroundColor: 'blue',
        borderWidth: 1
      },
      {
        label: '% of light',
        data: ldrMeasurements,
        borderColor: 'orange',
        backgroundColor: 'orange',
        borderWidth: 1
      },
      {
        label: '% of humidity',
        data: humidityMeasurements,
        borderColor: 'green',
        backgroundColor: 'green',
        borderWidth: 1
      },
      {
        label: 'Temperature',
        data: temperatureMeasurements,
        borderColor: 'red',
        backgroundColor: 'red',
        borderWidth: 1
      },
      {
        label: 'CPU temperature',
        data: cpuTemperatureMeasurements,
        borderColor: 'purple',
        backgroundColor: 'purple',
        borderWidth: 1
      }
    ]
  };

  return (
    <>
    <Typography
      marginTop={5}
      marginBottom={1}
      variant='h6'
      color={darkMode ? 'primary.contrastText' : ''}>
      Graphic of the latests {measurements.length} measurements
    </Typography>
    <Box
      marginTop={2}
      marginBottom={1}
      display='flex'
      justifyContent='left'>
      <FormControl size='small'>
        <InputLabel>Resolution</InputLabel>
        <Select
          value={resolution.toString()}
          label='Resolution'
          onChange={(event: SelectChangeEvent) => {
            setResolution(_p => Number(event.target.value));
          }}
          disabled={isLoading}>
          <MenuItem value={minutesToUploadSensorData}>{minutesToUploadSensorData} min. resolution</MenuItem>
          <MenuItem value={30}>30 min. resolution</MenuItem>
          <MenuItem value={60}>60 min. resolution</MenuItem>
        </Select>
      </FormControl>
    </Box>
    <Box
      display='flex'
      justifyContent='left'
      marginTop={2}
      marginBottom={1}>
      <Typography
        variant='body1'
        color={darkMode ? 'primary.contrastText' : ''}>
        Size of sample:
      </Typography>
    </Box>
    <Box marginBottom={2}
      paddingLeft={1}
      paddingRight={1}>
      <Slider
        defaultValue={defaultSizeOfSample}
        getAriaValueText={(value: number) => {
          return value.toString();
        }}
        onChange={(
          _e: Event,
          newValue: number | number[]
        ) => setSizeOfSample(_p => Number(newValue))}
        valueLabelDisplay='auto'
        step={minSizeOfSample}
        min={stepOfSample}
        max={maxSizeOfSample}
        disabled={isLoading}
        marks={marks} />
    </Box>
    {
      isLoading ?
        <Box
          paddingLeft={1}
          paddingRight={1}
          sx={{ width: '100%' }}>
          <LinearProgress color='success' />
        </Box> : null
    }
    <Box
      marginTop={1}
      marginBottom={3}
      sx={{
        opacity: isLoading ? '0.4' : '1'
      }}>
      <Line
        data={data}
        width='100%'
        height={500}
        options={{
          maintainAspectRatio: false
        }} />
    </Box>
    {
      measurements.length ?
      <>
        <Typography
          marginTop={5}
          variant='h6'
          color={darkMode ? 'primary.contrastText' : ''}>
          Latests 10 measurements
        </Typography>
        <Box
          marginTop={3}
          marginBottom={3}>
          <TableContainer component={Paper}>
            <Table aria-label='simple table'>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell align='right'>Soil M.</TableCell>
                  <TableCell align='right'>Light</TableCell>
                  <TableCell align='right'>Temp.</TableCell>
                  <TableCell align='right' sx={{
                      display: {
                        xs: 'none',
                        sm: 'block'
                      }
                    }}>Humid.</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {measurements.slice(0, 10).map((i: any) => (
                  <TableRow
                    key={i.id}>
                    <TableCell component='th' scope='row'>
                      {HourParser12Format(i.attributes.created)} 
                    </TableCell>
                    <TableCell align='right'>{i.attributes.soil_moisture}%</TableCell>
                    <TableCell align='right'>{i.attributes.ldr}%</TableCell>
                    <TableCell align='right'>{i.attributes.temperature}°C</TableCell>
                    <TableCell align='right' sx={{
                      display: {
                        xs: 'none',
                        sm: 'block'
                      }
                    }}>{i.attributes.humidity}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </> : null
    }
  </>
  );
};

export default Measurements;
