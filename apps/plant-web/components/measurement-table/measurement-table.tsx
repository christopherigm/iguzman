import {
  ReactElement,
  useState,
} from 'react';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import {Line} from 'react-chartjs-2';

import {
  HourParser12Format,
  ShortDateParser,
} from 'utils';

import type System from 'interfaces/system-interface';
import type MeasurementInterface from 'interfaces/measurement-interface';

const MeasurementTable = (props: System): ReactElement => {
  const [system, _updateSystem] = useState<System>(props);

  const getLocalDateFormat = (d: string): string => {
    let date = `${ShortDateParser(d).split(',')[0]}  ${HourParser12Format(d)}`; 
    return date;
  };

  const measurementsReversed = [...system.measurements];
  measurementsReversed.reverse();
  const labels = measurementsReversed.map((i: MeasurementInterface) => {
    return getLocalDateFormat(i.attributes.created);
  });
  const soilMoistureMeasurements = measurementsReversed.map((i: MeasurementInterface) => {
    return i.attributes.soil_moisture;
  });
  const ldrMeasurements = measurementsReversed.map((i: MeasurementInterface) => {
    return i.attributes.ldr;
  });
  const humidityMeasurements = measurementsReversed.map((i: MeasurementInterface) => {
    return i.attributes.humidity;
  });
  const temperatureMeasurements = measurementsReversed.map((i: MeasurementInterface) => {
    return i.attributes.temperature;
  });


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
      }
    ]
  };

  return (
    <>
    
    <Box
    marginTop={3}
    marginBottom={3}>
      <Line
        data={data}
        width='100%'
        height={500}
        options={{
          maintainAspectRatio: false
        }}
      />
    </Box>
    <Box
      marginTop={3}
      marginBottom={3}>
      <TableContainer component={Paper}>
        <Table aria-label="simple table">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell align="right">Soil moisture</TableCell>
              <TableCell align="right">LDR</TableCell>
              <TableCell align="right">Temperature</TableCell>
              <TableCell align="right">Humidity</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {system.measurements.map((i: any) => (
              <TableRow
                key={i.id}
                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
              >
                <TableCell component="th" scope="row">
                  {getLocalDateFormat(i.attributes.created)} 
                </TableCell>
                <TableCell align="right">{i.attributes.soil_moisture}%</TableCell>
                <TableCell align="right">{i.attributes.ldr}%</TableCell>
                <TableCell align="right">{i.attributes.temperature} °C</TableCell>
                <TableCell align="right">{i.attributes.humidity}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  </>
  );
};

export default MeasurementTable;
