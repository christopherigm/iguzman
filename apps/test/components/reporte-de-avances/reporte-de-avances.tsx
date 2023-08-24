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
                      <MenuItem value={'Electrico'}>Electrico</MenuItem>
                      <MenuItem value={'Mecanico'}>Mecanico</MenuItem>
                      <MenuItem value={'Estructural'}>Estructural</MenuItem>
                      <MenuItem value={'Arquitectonico'}>Arquitectonico</MenuItem>
                      <MenuItem value={'Civil'}>Civil</MenuItem>
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
                    <MenuItem value={'VideoVigilancia'}>VideoVigilancia</MenuItem>
                    <MenuItem value={'Control de acceso'}>Control de Acceso</MenuItem>
                    <MenuItem value={'Proteccion contra incendio'}>Proteccion contra incendios</MenuItem>
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
                    <MenuItem value={'Instalación de tubería conduit'}>Tubería Conduit</MenuItem>
                    <MenuItem value={'Instalación de Cableado UTP'}>Cableado UTP</MenuItem>
                    <MenuItem value={'Instalación de Cableado Control'}>Cable control</MenuItem>
                    <MenuItem value={'Instalación de Cableado Fas'}>cableado Fas</MenuItem>
                    <MenuItem value={'Instalación de Fibra Optica'}>Fibra optica</MenuItem>
                    <MenuItem value={'Instalación de Soporteria'}>Soporteria</MenuItem>
                    <MenuItem value={'Instalación de dispositivo'}>Dispositivos</MenuItem>
                    <MenuItem value={'Realizacion de pruebas'}>Puebas</MenuItem>
                    <MenuItem value={'Conexion de'}>Conexion</MenuItem>
                    <MenuItem value={'Instalación de etiquetas'}>Etiquetado</MenuItem>
                    <MenuItem value={'Atención de PunchList'}>PunchList</MenuItem>
                    <MenuItem value={'Preparación de'}>Preparacion</MenuItem>
                    <MenuItem value={'Corrección de'}>Correccion</MenuItem>
                    <MenuItem value={'Reparación de'}>Reparacion</MenuItem>
                    <MenuItem value={'Peinado de'}>Peinado</MenuItem>
                    <MenuItem value={'Colocación de'}>Colocacion</MenuItem>
                </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel id='sistema'>Sub Partida de Instalacion</InputLabel>
                <Select
                  labelId='subpartida'
                  id='subpartida'
                  value={state.subPartida}
                  label='Sub-Partida'
                  onChange={(event: SelectChangeEvent<string>) => {
                    dispatch({
                      type:'input',
                      name: 'subPartida',
                      value: event.target.value
                    });
                  }}
                  >
                    <MenuItem value={'3/4 pulgadas'}>3/4 pulgadas</MenuItem>
                    <MenuItem value={'1 pulgadas'}>1 pulgadas</MenuItem>
                    <MenuItem value={'1 1/2 pulgadas'}>1 1/2 pulgadas</MenuItem>
                    <MenuItem value={'npm 2 pulgadas'}>2 pulgadas</MenuItem>
                    <MenuItem value={'Camara'}>Camaras</MenuItem>
                    <MenuItem value={'Extender'}>Extender</MenuItem>
                    <MenuItem value={'PatchCord'}>PatchCord</MenuItem>
                    <MenuItem value={'Pabel'}>Panel</MenuItem>
                    <MenuItem value={'videovigilancia'}>Videovigilancia</MenuItem>
                    <MenuItem value={'control de acceso'}>Control de Acceso</MenuItem>
                    <MenuItem value={'sistema Fas'}>Sistema Fas</MenuItem>
                    <MenuItem value={'continuidad'}>Continuidad</MenuItem>
                    <MenuItem value={'tarjetas'}>Tarjetas</MenuItem>
                    <MenuItem value={'Tuberia Liquid Tight'}>Tuberia Liquid Tight</MenuItem>
                    <MenuItem value={'cableado'}>Cableado</MenuItem>
                    <MenuItem value={'soporteria'}>Soporteria</MenuItem>
                    <MenuItem value={'Dispositivos'}>Dispositivos</MenuItem>
                    <MenuItem value={'Equipos'}>Equipos</MenuItem>
                    <MenuItem value={'Accesorios'}>Accesorios</MenuItem>
                    <MenuItem value={'Pasos'}>Pasos</MenuItem>
                    <MenuItem value={'Perforaciones'}>Perforaciones</MenuItem>
                    <MenuItem value={'Tuberia'}>Tuberia</MenuItem>
                    <MenuItem value={'Sellos'}>Sellos</MenuItem>
                    <MenuItem value={'Placas'}>Placas</MenuItem>
                    <MenuItem value={'Bases'}>Bases</MenuItem>
                    <MenuItem value={''}>N/A</MenuItem>
                </Select>
            </FormControl>
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
                    <MenuItem value={'Pruebas'}>Pruebas</MenuItem>
                    <MenuItem value={'Conexiones'}>Conexiones</MenuItem>
                    <MenuItem value={'Cables'}>Cables</MenuItem>
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

          <Grid
          container>
            <Box
              display='flex'
              flexDirection='column'
              marginTop={5}> 
              {
                avance.map((i: RegistroAvances, index: number) => {
                  return (
                    <Grid
                      key={index}>
                        <Box
                          padding={2}>
                          <Divider variant="middle" />
                          <Typography> {
                              `Disciplina: ${i.disciplina}, Subdisciplina: ${i.subDisciplina}`
                            }
                          </Typography>
                          <Typography> 
                            {`Instalacion: ${i.partida} de ${i.subPartida} en nivel: ${i.nivel} `}
                            {i.cantidad ? `una cantidad de: ${i.cantidad} ${i.unidad}, ` : ''}
                            {`${i.modo} Ubicado en: ${i.ubicacion} `} 
                            {i.comentarioAdicional ? i.comentarioAdicional : ''}
                          </Typography>
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

export default ReporteDeAvances;
