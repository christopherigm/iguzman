import React, {
  ReactElement,
  useState,
  useReducer,
} from 'react';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import {
  State,
  Reporte,
  Reducer,
  InitialState,
} from './reducer';
import { Button, Grid, Paper } from '@mui/material';

const Bitacora = (): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [reporte, setReporte] = useState<Array<Reporte>>([]);
  return (
    <>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='h4'>BITACORA</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField 
              fullWidth
              label= ''
              value={state.fecha}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'fecha',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel id='categoriaId' >Categoria</InputLabel>
              <Select
                labelId='categoriaId'
                id='categoriaId'
                value={state.categoria}
                label='Categoria'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch({
                    type: 'input',
                    name: 'categoria',
                    value: event.target.value
                  });
                }}>
                  <MenuItem value={'Administracion'}>Administracion</MenuItem>
                  <MenuItem value={'Ingenieria'}>Ingenieria</MenuItem>
                  <MenuItem value={'Ambiental'}>Abmiental</MenuItem>
                  <MenuItem value={'Calidad'}>Calidad</MenuItem>
                  <MenuItem value={'Contabilidad'}>Contabilidad</MenuItem>
                  <MenuItem value={'Seguridad'}>Seguridad</MenuItem>
                  <MenuItem value={'Junta'}>Junta</MenuItem>
                  <MenuItem value={'Revision'}>Revision</MenuItem>
                  <MenuItem value={'Cierre'}>Cierre</MenuItem>
                  <MenuItem value={'Instalación'}>Instalación</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Otra categoria'
              value={state.otraCategoria}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'otraCategoria',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label= 'Comentario'
              value={state.comentario}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'comentario',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Etiquetas'
              value={state.etiqueta}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'etiqueta',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Emisor'
              value={state.emisor}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'emisor',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='end'>
              <Button
                variant='contained'
                onClick={() => setReporte (value => {
                  const reporte = [...value];
                  reporte.push({
                    fecha: state.fecha,
                    categoria: state.categoria,
                    otraCategoria: state.otraCategoria,
                    comentario: state.comentario,
                    etiqueta: state.etiqueta,
                    emisor: state.emisor
                  });
                  return reporte;
                })}>Guardar</Button>
            </Box>
          </Grid>
      </Grid>
      <Grid
        container>
          <Box
            display='flex'
            flexDirection='column'
            marginTop={5}> 
            {
              reporte.map((i: Reporte, index: number) => {
                return (
                  <Grid
                    key={index}
                    marginBottom={3}>
                      <Paper elevation={3}>
                        <Box
                          padding={2}>
                          <Typography>Fecha: {i.fecha}</Typography>
                          <Typography>Categoria: {i.otraCategoria ? `${i.otraCategoria}` : i.categoria}</Typography>
                          <Typography>Comentario: {i.comentario}</Typography>
                          <Typography>Etiquetas: {`#${i.etiqueta} #${i.otraCategoria ? i.otraCategoria : `${i.categoria}`}`}</Typography>
                          <Typography>Emisor de reporte: {i.emisor}</Typography>
                        </Box>
                      </Paper>
                  </Grid>
                );
              })
            }
          </Box>
      </Grid>
    </>
  );
};

export default Bitacora;
