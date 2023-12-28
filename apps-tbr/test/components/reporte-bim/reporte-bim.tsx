import React, {
  ReactElement,
  useState,
  useReducer
} from 'react';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import { Button, Grid, Paper } from '@mui/material';
import Divider from '@mui/material/Divider';
import { 
  ReporteBim,
  InitialState,
  Reducer
} from './reducer';

const ReporteBim = () => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [reporteBim, setReporteBim] = useState<Array<ReporteBim>>([]);
  return(
    <>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
           <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='h4'>REPORTE DE MODELADO BIM</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label=''
              value={state.fecha}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
                dispatch({
                  type: 'input',
                  name: 'fecha',
                  value: event.target.value
                });
            }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='reporteId'>Reporte</InputLabel>
            <Select
              labelId='reporteId'
              id='reporteId'
              value={state.reporte}
              label='Reporte'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'reporte',
                  value: event.target.value
                });
              }}>
              <MenuItem value={'Altualizacion de ingenieria'}>Actualizacion</MenuItem>
              <MenuItem value={'Cambios en ingenieria'}>Cambios</MenuItem>
              <MenuItem value={'Sin cambios en el modelo'}>Sin cambios</MenuItem>
              <MenuItem value={'Trabajo en planos de taller'}>Planos de taller</MenuItem>
              <MenuItem value={'Trabajo en planos Asbuilt'}>Asbuilt</MenuItem>
              <MenuItem value={'Trabajo en Red Lines'}>Red Lines</MenuItem>
              <MenuItem value={'Generacion de RFI'}>RFI</MenuItem>
              <MenuItem value={'Generacion de Submital'}>Submital</MenuItem>
            </Select>
            </FormControl>  
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='proyectoId'>Proyecto</InputLabel>
            <Select
              labelId='proyectoId'
              id='proyectoSelectId'
              value={state.proyecto}
              label='proyecto'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'proyecto',
                  value: event.target.value
                });
              }}>
              <MenuItem value={'GM RAMOS ARIZPE MX'}>GM RAMOS ARIZPE</MenuItem>
              <MenuItem value={'GM SAN LUIS POTOSI MX'}>GM SAN LUIS POTOSI</MenuItem>
              <MenuItem value={'GM SILAO MX'}>GM SILAO</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='edificioId'>Edificio</InputLabel>
            <Select
              labelId='edificioId'
              id='edificioSectectId'
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
            </Select>
            </FormControl>  
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='bimCoordinator'>Bim Coordinator</InputLabel>
            <Select
              labelId='bimCoordinator'
              id='bimCoordinator'
              value={state.bimCoordinator}
              label='Bim Coordinator'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'bimCoordinator',
                  value: event.target.value
                });
              }}>
              <MenuItem value={'Leonel Chavez'}>Leonel Chavez</MenuItem>
              <MenuItem value={'Abdiel Ramirez'}>Abdiel Ramirez</MenuItem>
              <MenuItem value={'Daniel Ortiz'}>Daniel Ortiz</MenuItem>
              <MenuItem value={'Otro'}>Otro</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='sistemaId'>Sistema</InputLabel>
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
              }}>
              <MenuItem value={'VideoVigilancia'}>Videovigilancia</MenuItem>
              <MenuItem value={'Control de acceso'}>Control de Acceso</MenuItem>
              <MenuItem value={'Alarma Contra Incendios'}>Alarma contra incendios</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='actividadId'>Actividad</InputLabel>
            <Select
              labelId='actividadId'
              id='actividadId'
              value={state.actividad}
              label='Actividad'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'actividad',
                  value: event.target.value
                });
              }}>
              <MenuItem value={'Generacion de proyecto inicial'}>Generacion de proyecto</MenuItem>
              <MenuItem value={'Trabajo en planos de taller'}>Planos de taller</MenuItem>
              <MenuItem value={'Trabajo en planos asbuilt'}>Planos Asbuilt</MenuItem>
              <MenuItem value={'Modelado de tuberia'}>Modelado de tuberia</MenuItem>
              <MenuItem value={'Modelado de sopoteria'}>Modelado de soporteria</MenuItem>
              <MenuItem value={'Modelado y sembrado de dispositivos'}>Modelado de Dispositivos</MenuItem>
              <MenuItem value={'Modelado de familias'}>Modelado de familias</MenuItem>
              <MenuItem value={'Modelado de cableado'}>Modelado de cableado</MenuItem>
              <MenuItem value={'Generacion de detalles'}>Generacion de detalles</MenuItem>
              <MenuItem value={'Cambios en la ingenieria inicial o aprobada'}>Cambios en ingenieria</MenuItem>
              <MenuItem value={'Cambios en planos'}>Cambios en planos</MenuItem>
              <MenuItem value={'Cambios en dispositivos'}>Cambios en dispositivos</MenuItem>
              <MenuItem value={'Trabajo en Red lines'}>Trabajo en Red Lines</MenuItem>
              <MenuItem value={'Trabajo en reporte de levantamiento de campo'}>Reporte de levantamiento de campo</MenuItem>
              <MenuItem value={'Recorrido en sitio para validacion de ingenieria'}>Recorrido en sitio</MenuItem>
              <MenuItem value={'Actualizacion de modelo bim en general'}>Actualizacion gral</MenuItem>
              <MenuItem value={'Trabajo en RFI para aprobacion'}>Trabajo en RFI</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='estatusId'>Estatus de actividad</InputLabel>
            <Select
              labelId='estatusId'
              id='estatusId'
              value={state.estatus}
              label='Estatus de actividad'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'estatus',
                  value: event.target.value
                });
              }}>
              <MenuItem value={'por iniciar'}>Por iniciar</MenuItem>
              <MenuItem value={'en proceso'}>En proceso</MenuItem>
              <MenuItem value={'de terminado'}>Terminado</MenuItem>
              <MenuItem value={'de terminado y en espera de validacion por parte del cliente'}>En espera de validacion</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label='Comentario Adicional'
              value={state.comentario}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
                dispatch({
                  type: 'input',
                  name: 'comentario',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label='Ubicacion'
              value={state.ubicacion}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
                dispatch({
                  type: 'input',
                  name: 'ubicacion',
                  value: event.target.value
                });
              }} /> 
          </Grid>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='end'>
              <Button
                variant='contained'
                onClick={() => setReporteBim (value => {
                  const reporteBim = [...value];
                  reporteBim.push({
                    fecha: state.fecha,
                    proyecto: state.proyecto,
                    reporte: state.reporte,
                    edificio: state.edificio,
                    bimCoordinator: state.bimCoordinator,
                    sistema: state.sistema,
                    actividad: state.actividad,
                    estatus: state.estatus,
                    comentario: state.comentario,
                    ubicacion: state.ubicacion
                  });
                  return reporteBim;
                })}>Guardar</Button>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Typography textAlign='center'>REPORTE DE MODELADO BIM</Typography>
          </Grid>
          
      </Grid>
      <Grid container>
            <Box
              display='flex'
              flexDirection='row'
              flexWrap='wrap'
              marginTop={5}>
                {
                  reporteBim.map((i: ReporteBim, index: number) => {
                    return (
                      <Grid
                        key={index}
                        marginBottom={3}
                        item xs={12}>
                          <Box padding={1}>
                            <Paper elevation={3}>
                              <Box padding={2} textAlign='center'>
                                <Grid container spacing={2}>
                                  <Grid item xs={12}>
                                    <Typography>Fecha: {i.fecha}</Typography>
                                  </Grid>
                                  <Grid item xs={4}>
                                    <Typography>Proyecto: {i.proyecto}</Typography>
                                  </Grid>
                                  <Grid item xs={4}>
                                    <Typography>Reporte: {i.reporte}</Typography>
                                  </Grid>
                                  <Grid item xs={4}>
                                    <Typography>Edificio: {i.edificio}</Typography>
                                  </Grid>
                                  <Grid item xs={4}>
                                    <Typography>Bim Coordinator: {i.bimCoordinator}</Typography>
                                  </Grid>
                                  <Grid item xs={4}>
                                    <Typography>Bim Modeler: Edgar Monsalvo</Typography>
                                  </Grid>
                                  <Grid item xs={4}>
                                    <Typography>Sistema: {i.sistema}</Typography>
                                  </Grid>
                                  <Grid item xs={12}>
                                    <Typography textAlign='left'>
                                      {
                                        `Actividad: ${i.actividad} ${i.estatus ? `con un estatus:${i.estatus}` : ''} ${i.ubicacion ? `ubicado en: ${i.ubicacion}` : '' } ${i.comentario}` 
                                      }
                                    </Typography>
                                  </Grid>
                                  <Grid item xs={4}></Grid>
                                </Grid>
                              </Box>
                            </Paper>
                          </Box>
                      </Grid>
                    );
                  })
                }
            </Box>
          </Grid>
    </>
  );
};

export default ReporteBim;
