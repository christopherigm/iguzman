import React, {
  ReactElement,
  useState,
  useReducer,
} from 'react';
import {
  State,
  RegistroProyecto,
  Reducer,
  InitialState,
} from './reducer';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Button, Divider, Grid, Paper } from '@mui/material';

const RegistroDeProyecto = (): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [proyecto, setProyecto] = useState<Array<RegistroProyecto>>([]);
  return (
    <>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
        <Grid item xs={12}>
          <Box display='flex' justifyContent='center'>
            <Typography variant='body1'>REGISTRO DE PROYECTO</Typography>
          </Box>
        </Grid>
        <Grid item xs={12} sm={4}>
          {/* <Typography variant='body2'>Nombre de proyecto</Typography> */}
          <Box marginTop={2.5}>
            <TextField
              fullWidth
              label='Nombre del proyecto'
              value={state.nombreProyecto}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'nombreProyecto',
                  value: event.target.value
                });
              }} />
          </Box>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Typography variant='body2'>Fecha inicio de proyecto</Typography>
          <TextField
              fullWidth
              value={state.fechaInicio}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'fechaInicio',
                  value: event.target.value
                });
              }}/>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Typography variant='body2'>Fecha fin de proyecto</Typography>
            <TextField
                fullWidth
                value={state.fechaFin}
                type='date'
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  dispatch({
                    type: 'input',
                    name: 'fechaFin',
                    value: event.target.value
                  });
                }}/>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label='Numero de contrato o proyecto'
            value={state.numContrato}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'numContrato',
                value: event.target.value
              });
            }}/>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
              fullWidth
              label='Ubicacion de proyecto'
              value={state.ubicacionProyecto}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'ubicacionProyecto',
                  value: event.target.value
                });
              }}/>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
                fullWidth
                label='Nombre del cliente'
                value={state.cliente}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  dispatch({
                    type: 'input',
                    name: 'cliente',
                    value: event.target.value
                  });
                }}/>
        </Grid>
        <Grid item xs={12}>
          <Box display='flex' justifyContent='end'>
            <Button
              variant='contained'
              onClick={() => setProyecto (value => {
                const proyecto = [...value];
                proyecto.push({
                  nombreProyecto: state.nombreProyecto,
                  fechaInicio: state.fechaInicio,
                  fechaFin: state.fechaFin,
                  numContrato: state.numContrato,
                  ubicacionProyecto: state.ubicacionProyecto,
                  cliente: state.cliente
                });
                return proyecto;
              })}>Guardar</Button>
          </Box>
        </Grid>
      </Grid>
      <Grid
        container
        marginTop={5}
        rowSpacing={1}>
      {
        proyecto.map((i: RegistroProyecto, index: number) => {
          return (
            <Grid
              key={index}
              marginBottom={3}
              item
              xs={12}>
              <Paper elevation={3}>
                <Box padding={2}>
                  <Typography variant='h6'>Nombre de proyecto: {i.nombreProyecto}</Typography>
                  <Typography>Fecha de inicio de proyecto: {i.fechaInicio}</Typography>
                  <Typography>Fecha de finalizacion de proyecto: {i.fechaFin}</Typography>
                  <Typography>Numero de contrato o proyecto: {i.numContrato}</Typography>
                  <Typography>Ubicacion de proyecto: {i.ubicacionProyecto}</Typography>
                  <Typography>Cliente de proyecto: {i.cliente}</Typography>
                </Box>
              </Paper>
            </Grid>
          );
        })
      }
      </Grid>
      {/* <Box
        marginTop={3}
        marginBottom={3}>
        <Divider />
      </Box>
      <Box
        display='flex'
        flexDirection='row'
        flexWrap='wrap'
        justifyContent='space-between'>
        {
          proyecto.map((i: RegistroProyecto, index: number) => {
            return (
              <Box
                width='100%'
                marginBottom={2}>
                <Paper elevation={3}>
                  <Box padding={2}>
                    <Typography variant='h6'>Nombre de proyecto: {i.nombreProyecto}</Typography>
                    <Typography>Fecha de inicio de proyecto: {i.fechaInicio}</Typography>
                    <Typography>Fecha de finalizacion de proyecto: {i.fechaFin}</Typography>
                    <Typography>Numero de contrato o proyecto: {i.numContrato}</Typography>
                    <Typography>Ubicacion de proyecto: {i.ubicacionProyecto}</Typography>
                    <Typography>Cliente de proyecto: {i.cliente}</Typography>
                  </Box>
                </Paper>
              </Box>
            );
          })
        }
      </Box> */}
    </>
  );
};

export default RegistroDeProyecto;
