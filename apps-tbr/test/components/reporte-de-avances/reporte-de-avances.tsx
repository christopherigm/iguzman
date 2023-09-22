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
  RegistroAvances,
  Reducer,
  InitialState,
} from './reducer';
import { Button, Grid } from '@mui/material';


const ReporteDeAvances = (): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [avance, setAvance] = useState<Array<RegistroAvances>>([]);
  return (
    <>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
        <Grid item xs={12}>
          <Box display='flex' justifyContent='center'>
            <Typography variant='h4'>REPORTE DE AVANCE DIARIO</Typography>
          </Box>
        </Grid>
        <Grid item xs={12} sm={3}>
          <FormControl fullWidth>
              <InputLabel id='disciplinaId'>Disciplina</InputLabel>
                <Select
                  labelId='disciplinaId'
                  id='disciplinaId'
                  value={state.disciplina}
                  label='Sistema'
                  onChange={(event: SelectChangeEvent<string>) => {
                    dispatch({
                      type: 'input',
                      name: 'disciplina',
                      value: event.target.value
                    });
                  }}>
                    <MenuItem value={'Alarma contra incendios'}>Alarma contra incendios</MenuItem>
                    <MenuItem value={'Arquitectura'}>Arquitectura</MenuItem>
                    <MenuItem value={'Cimentaciones'}>Cimentaciones</MenuItem>
                    <MenuItem value={'Civil'}>Civil</MenuItem>
                    <MenuItem value={'Eléctrico'}>Electrico</MenuItem>
                    <MenuItem value={'Estructural'}>Estructural</MenuItem>
                    <MenuItem value={'Mecánico'}>Mecánico</MenuItem>
                    <MenuItem value={'Sifónico'}>Sifónico</MenuItem>
                    <MenuItem value={'Topografía'}>Topografía</MenuItem>
                    <MenuItem value={'Urbanismo'}>Urbanismo</MenuItem>
                    <MenuItem value={''}>N/A</MenuItem>
                </Select>
            </FormControl>
        </Grid>
        <Grid item xs={12} sm={3}>
          <FormControl fullWidth>
            <InputLabel id='subDisciplinaId'>SubDisciplina</InputLabel>
              <Select
                labelId='subDisciplinaId'
                id='subDisciplinaId'
                value={state.subDisciplina}
                label='Sistema'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch({
                    type: 'input',
                    name: 'subDisciplina',
                    value: event.target.value
                  });
                }}>
                  <MenuItem value={'Alarmas'}>Alarmas</MenuItem>
                  <MenuItem value={'Alimentación'}>Alimentación</MenuItem>
                  <MenuItem value={'Anclajes / Pilotes'}>Anclajes / Pilotes</MenuItem>
                  <MenuItem value={'Cimentaciones profundas'}>Cimentaciones profundas</MenuItem>
                  <MenuItem value={'Cimentaciones superficiales'}>Cimentaciones superficiales</MenuItem>
                  <MenuItem value={'Demolición '}>Demolición </MenuItem>
                  <MenuItem value={'Diseño'}>Diseño</MenuItem>
                  <MenuItem value={'Drenaje y Saneamiento '}>Drenaje y Saneamiento </MenuItem>
                  <MenuItem value={'Equipos mecánicos industriales'}>Equipos mecánicos industriales</MenuItem>
                  <MenuItem value={'Estructura de acero'}>Estructura de acero</MenuItem>
                  <MenuItem value={'Estructura de concreto armado'}>Estructura de concreto armado</MenuItem>
                  <MenuItem value={'Excavación'}>Excavación</MenuItem>
                  <MenuItem value={'Fachadas y cubiertas'}>Fachadas y cubiertas</MenuItem>
                  <MenuItem value={'Hormigón armado'}>Hormigón armado</MenuItem>
                  <MenuItem value={'Hvac'}>Hvac</MenuItem>
                  <MenuItem value={'Iluminación'}>Iluminación</MenuItem>
                  <MenuItem value={'Integración de tecnología'}>Integración de tecnología</MenuItem>
                  <MenuItem value={'Muros'}>Muros</MenuItem>
                  <MenuItem value={'Muros de contención '}>Muros de contención </MenuItem>
                  <MenuItem value={'Redes de comunicación y datos'}>Redes de comunicación y datos</MenuItem>
                  <MenuItem value={'Simulacros de incendios'}>Simulacros de incendios</MenuItem>
                  <MenuItem value={'Sistema contra incendios'}>Sistema contra incendios</MenuItem>
                  <MenuItem value={'Sistema de control de acceso'}>Sistema de control de acceso</MenuItem>
                  <MenuItem value={'Sistemas de extinción de incendios'}>Sistemas de extinción de incendios</MenuItem>
                  <MenuItem value={'Sistemas eléctricos'}>Sistemas eléctricos</MenuItem>
                  <MenuItem value={'Ventilación '}>Ventilación </MenuItem>
                  <MenuItem value={'Videovigilancia'}>Videovigilancia</MenuItem>
              </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={2}>
          <TextField 
            fullWidth
            label= 'Nivel'
            value={state.nivel}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'nivel',
                value: event.target.value
              });
            }} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel id='sistema'>Partida de Instalacion</InputLabel>
              <Select
                labelId='partida'
                id='partida'
                value={state.partida}
                label='Instalacion'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch({
                    type: 'input',
                    name: 'partida',
                    value: event.target.value
                  });
                }}
                >
                <MenuItem value={'Ajuste'}>Ajuste </MenuItem>
                <MenuItem value={'Anclaje'}>Anclaje</MenuItem>
                <MenuItem value={'Armado'}>Armado</MenuItem>
                <MenuItem value={'Certificación'}>Certificación</MenuItem>
                <MenuItem value={'Colocación'}>Colocación</MenuItem>
                <MenuItem value={'Conexión'}>Conexión</MenuItem>
                <MenuItem value={'Corrección'}>Corrección</MenuItem>
                <MenuItem value={'Creación'}>Creación</MenuItem>
                <MenuItem value={'Enfoque'}>Enfoque</MenuItem>
                <MenuItem value={'Etiquetado'}>Etiquetado</MenuItem>
                <MenuItem value={'Ingreso'}>Ingreso</MenuItem>
                <MenuItem value={'Instalación'}>Instalación</MenuItem>
                <MenuItem value={'Mantenimiento'}>Mantenimiento</MenuItem>
                <MenuItem value={'Medición '}>Medición </MenuItem>
                <MenuItem value={'Modificación'}>Modificación</MenuItem>
                <MenuItem value={'Perforación'}>Perforación</MenuItem>
                <MenuItem value={'Preparación'}>Preparación</MenuItem>
                <MenuItem value={'Pruebas'}>Pruebas</MenuItem>
                <MenuItem value={'Reparación'}>Reparación</MenuItem>
                <MenuItem value={'Revisión'}>Revisión</MenuItem>
                <MenuItem value={'Trabajo'}>Trabajo</MenuItem>
                <MenuItem value={''}>N/A</MenuItem>
              </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label='Sub Partida de instalación'
            value={state.subPartida}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type:'input',
                name:'subPartida',
                value: event.target.value
              });
            }} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
              fullWidth
              label='Cantidad instalada'
              type='number'
              value={state.cantidad}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'cantidad',
                  value: event.target.value
                });
              }}
              />
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel id='unidad'>Unidad instalada</InputLabel>
              <Select
                labelId='unidad'
                id='unidad'
                value={state.unidad}
                label='Unidad instalada'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch({
                    type: 'input',
                    name: 'unidad',
                    value: event.target.value
                  });
                }}
                >
                  <MenuItem value={'Metros'}>Metros</MenuItem>
                  <MenuItem value={'Piezas'}>Pzas</MenuItem>
                  <MenuItem value={'Unidades'}>Unidades</MenuItem>
                  <MenuItem value={`${state.subPartida}`}>N/A</MenuItem>
              </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel id='modoInstalacion'>Modo de instalacion</InputLabel>
              <Select
                labelId='modoInstalacion'
                id='modoInstalacion'
                value={state.modo}
                label='Modo de instalacion'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch({
                    type: 'input',
                    name: 'modo',
                    value: event.target.value
                  });
                }}
                >
                  <MenuItem value={'con plataforma de elevacion'}>Plataforma de elevacion</MenuItem>
                  <MenuItem value={'a nivel de piso'}>A nivel de piso</MenuItem>
                  <MenuItem value={'con andamios'}>Andamios</MenuItem>
                  <MenuItem value={'con escalera'}>Escaleras</MenuItem>
              </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={8}>
          <TextField
              fullWidth
              label='Ubicacion'
              value={state.ubicacion}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type:'input',
                  name:'ubicacion',
                  value: event.target.value
                });
              }} />
        </Grid>
        <Grid item xs={12}>
          <TextField
              fullWidth
              label='Comentario Adicional'
              value={state.comentarioAdicional}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'comentarioAdicional',
                  value: event.target.value
                });
              }}
              />
        </Grid>
        <Grid item xs={12}>
          <Box display='flex' justifyContent='end'>
            <Button
              variant='contained'
              onClick={() => setAvance (value => {
                const avance = [...value];
                avance.push({
                  disciplina: state.disciplina,
                  subDisciplina: state.subDisciplina,
                  partida: state.partida,
                  subPartida: state.subPartida,
                  nivel: state.nivel,
                  cantidad: state.cantidad,
                  unidad: state.unidad,
                  modo: state.modo,
                  ubicacion: state.ubicacion,
                  comentarioAdicional: state.comentarioAdicional
                });
                return avance;
              })}>Guardar</Button>
          </Box>
        </Grid>
    </Grid>
    <Grid
        container>
          {
            avance.map((i: RegistroAvances, index: number) => {
              return (
                <Grid
                  key={index}
                  item xs={12}>
                    <Box
                      padding={2}>
                      <Divider variant="middle" />
                      <Typography> {
                          `Disciplina: ${i.disciplina}, Subdisciplina: ${i.subDisciplina}`
                        }
                      </Typography>
                      <Typography> 
                        {`Instalacion: ${i.partida} de ${i.subPartida}`}
                        {i.nivel ? ` en Nivel: ${i.nivel}` : ''}
                        {i.cantidad ? ` una cantidad de: ${i.cantidad} ${i.unidad} ` : ''}
                        {i.modo ? ` ${i.modo} ` : ''}
                        {i.ubicacion ? `, Ubicado en: ${i.ubicacion} ` : ''} 
                      </Typography>
                      <Typography>{i.comentarioAdicional ? `Comentario adicional: ${i.comentarioAdicional}` : ''}</Typography>
                    </Box>
                </Grid>
              );
            })
          }
        </Grid>
    </>
  );
};

export default ReporteDeAvances;
