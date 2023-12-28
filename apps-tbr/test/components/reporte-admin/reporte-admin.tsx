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
  Reportes,
  Reducer,
  InitialState,
} from './reducer';
import { Button, Grid, Paper } from '@mui/material';

const ReporteAdministrativo = (): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [reportes, setReportes] = useState<Array<Reportes>>([]);

  return(
    <>
    <Grid
      container
      rowSpacing={2}
      columnSpacing={2}
      marginTop={5}>
      <Grid item xs={12}>
        <Box display='flex' justifyContent='center'>
          <Typography variant='h4'>REGISTROS ADMINISTRATIVOS</Typography>
        </Box>
      </Grid>
      <Grid item xs={12}>
        <Box display='flex' justifyContent='center'>
          <Typography variant='body1'>Encabezado general</Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={4}>
        <FormControl fullWidth>
          <InputLabel id='proyectoId' >Proyecto</InputLabel>
          <Select
            labelId='proyectoId'
            id='proyectoId'
            value={state.proyecto}
            label='Proyecto'
            onChange={(event: SelectChangeEvent<string>) => {
              dispatch({
                type: 'input',
                name: 'proyecto',
                value: event.target.value
              });
            }}>
              <MenuItem value={'GENERAL MOTORS, RAMOS ARIZPE COAHUILA'}>GM RAMOS</MenuItem>
              <MenuItem value={'GENERAL MOTORS SAN LUIS POTOSI'}>GM SAN LUIS</MenuItem>
              <MenuItem value={'GENERAL MOTORS GUANAJUATO'}>GM SILAO</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={4}>
        <FormControl fullWidth>
          <InputLabel id='edificioId' >Edificio</InputLabel>
          <Select
            labelId='edificioId'
            id='edificioId'
            value={state.edificio}
            label='Edificio'
            onChange={(event: SelectChangeEvent<string>) => {
              dispatch({
                type: 'input',
                name: 'edificio',
                value: event.target.value
              });
            }}>
              <MenuItem value={'Two Tone'}>Two Tone</MenuItem>
              <MenuItem value={'Bap 2'}>Bap 2</MenuItem>
              <MenuItem value={'Ress 2'}>Ress 2</MenuItem>
              <MenuItem value={'Body Shop'}>Body Shop</MenuItem>
              <MenuItem value={'Genenal Assembly GA'}>GA</MenuItem>
              <MenuItem value={'Heat Treat'}>Heat Treat</MenuItem>
              <MenuItem value={'Gears'}>Gears</MenuItem>
              <MenuItem value={'Edu Gps 1'}>Edu Gps1</MenuItem>
              <MenuItem value={'Paint Shop'}>Paint Shop</MenuItem>
              <MenuItem value={'Ress 1'}>Ress 1</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField
          fullWidth
          label=''
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
      <Grid item xs={12}>
        <Box display='flex' justifyContent='center'>
          <Typography variant='body1'>Reportes</Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={3}>
        <FormControl fullWidth>
          <InputLabel id='sistemaId' >Sistema</InputLabel>
          <Select
            labelId='sistemaId'
            id='sistemaId'
            value={state.sistema}
            label='Sistema'
            onChange={(event: SelectChangeEvent<string>) => {
              dispatch({
                type: 'input',
                name: 'sistema',
                value: event.target.value
              });
            }} >
              <MenuItem value={'Videovigilancia'}>VideoVigilancia</MenuItem>
              <MenuItem value={'Control de Acceso'}>Control de Acceso</MenuItem>
              <MenuItem value={'Alarma contra incendios'}>Fire Alarm System</MenuItem>
              <MenuItem value={'General'}>General</MenuItem>
          </Select>
        </FormControl>
      </Grid> 
      <Grid item xs={12} sm={3}>
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
      <Grid item xs={12} sm={3}>
        <TextField
              fullWidth
              label='Otra Categoria'
              value={state.otraCategoria}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'otraCategoria',
                  value: event.target.value
                });
              }} />
      </Grid>
      <Grid item xs={12} sm={3}>
        <FormControl fullWidth>
          <InputLabel id='empresaId' >Empresa</InputLabel>
          <Select
            labelId='empresaId'
            id='empresaId'
            value={state.empresa}
            label='Empresa'
            onChange={(event: SelectChangeEvent<string>) => {
              dispatch({
                type: 'input',
                name: 'empresa',
                value: event.target.value
              });
            }}>
              <MenuItem value={'Altatec'}>Altatec</MenuItem>
              <MenuItem value={'Walbridge'}>Walbridge</MenuItem>
              <MenuItem value={'General Motors'}>General Motors</MenuItem>
              <MenuItem value={'GK'}>GK</MenuItem>
              <MenuItem value={'Johnson Controls'}>Johnson Controls</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={3}>
        <TextField
          fullWidth
          label='Otra empresa'
          value={state.otraEmpresa}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            dispatch({
              type: 'input',
              name: 'otraEmpresa',
              value: event.target.value
            });
          }} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label='Descripcion'
          value={state.descripcion}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            dispatch({
              type: 'input',
              name: 'descripcion',
              value: event.target.value
            });
          }} />
      </Grid>
      <Grid item xs={12} sm={3}>
        <TextField
          fullWidth
          label='Etiqueta'
          value={state.etiqueta}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            dispatch({
              type: 'input',
              name: 'etiqueta',
              value: event.target.value
            });
          }} />
      </Grid>
      <Grid item xs={12}>
        <Box display='flex' justifyContent='end'>
          <Button
            variant='contained'
            onClick={() => setReportes (value => {
              const reportes = [...value];
              reportes.push({
                sistema: state.sistema,
                categoria: state.categoria,
                otraCategoria: state.otraCategoria,
                empresa: state.otraCategoria,
                otraEmpresa: state.empresa,
                descripcion: state.descripcion,
                etiqueta: state.etiqueta
              });
              return reportes;
            })}>Guardar</Button>
        </Box>
      </Grid>
    </Grid>
    <Box marginBottom={4}></Box>
    <Divider variant="middle" />
    <Box display='flex' justifyContent='center'>
        <Typography variant='body1'>REPORTES GENERADOS</Typography>
    </Box>
    

    <Grid
      container
      rowSpacing={2}
      columnSpacing={2}>
        <Grid item xs={12}>
          <div>Proyecto: {state.proyecto}</div>
          <div>Edificio: {state.edificio}</div>
          <div>Fecha: {state.fecha}</div>
        </Grid>
        <Grid item xs={12}>
          <Box>
            {
              reportes.map((i: Reportes, index: number ) => {
                return (
                  <Grid
                    key={index}
                    marginBottom={3}
                    item xs={12}>
                      <Box>
                        <div>Sistema: {i.sistema}</div>
                        <div>Categoria: {i.otraCategoria ? i.otraCategoria : i.categoria}</div>
                        <div>Empresa: {i.otraEmpresa ? i.otraEmpresa : i.empresa}</div>
                        <div>Descripcion: {i.descripcion}</div>
                        <div>Etiquetas: {`#${i.etiqueta} `}{i.otraCategoria ? ` #${i.otraCategoria}` : `#${i.categoria}`}</div>
                      </Box>
                  </Grid>
                );
              })
            }
          </Box>
        </Grid>
    </Grid>
    </>
  );
};

export default ReporteAdministrativo;
