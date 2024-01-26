import React, { useReducer, useState } from 'react';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import { Button, Grid, Paper } from '@mui/material';
import {
  State,
  RegistroEmpresas,
  RegistroEventos,
  Reducer,
  InitialState,
} from './reducer';


const MinutasDeJunta = () => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [registroEmpresa, setRegistroEmpresa] = useState<Array<RegistroEmpresas>>([]);
  const [registroEvento, setRegistroEvento] = useState<Array<RegistroEventos>>([]);

  return(
    <div>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center' marginBottom={2}>
              <Typography variant='h4'>MINUTAS DE JUNTAS</Typography>
            </Box>
            <Divider variant="middle" />
            <Typography textAlign='center'>Encabezado de minuta</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant='body2'>Fecha</Typography>
            <TextField
            fullWidth
            type='date'
            value={state.fecha}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'fecha',
                value: event.target.value
              });
            }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant='body2'>Hora inicio de junta</Typography>
            <TextField
              fullWidth
              type='time'
              value={state.horaInicio}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'horaInicio',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant='body2'>Hora fin de junta</Typography>
              <TextField
                fullWidth
                type='time'
                value={state.horafin}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  dispatch({
                    type: 'input',
                    name: 'horafin',
                    value: event.target.value
                  });
                }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
            <InputLabel id='ubicacionJunta'>Ubicacion de junta</InputLabel>
            <Select
              labelId='ubicacionJunta'
              id='ubicacionJunta'
              value={state.ubicacion}
              label='Ubicacion de junta'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'ubicacion',
                  value: event.target.value
                });
              }}
            >
              <MenuItem value={'Coahuila, Mexico'}>Coahuila, Mexico</MenuItem>
              <MenuItem value={'San Luis Potosi, Mexico'}>San Luis Potosi, Mexico</MenuItem>
              <MenuItem value={'Silao, Mexico'}>Silao, Mexico</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
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
              }}
            >
              <MenuItem value={'GM RAMOS ARIZPE MX'}>GM RAMOS ARIZPE</MenuItem>
              <MenuItem value={'GM SAN LUIS POTOSI MX'}>GM SAN LUIS POTOSI</MenuItem>
              <MenuItem value={'GM SILAO MX'}>GM SILAO</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
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
              }}
              >
              <MenuItem value={'Two Tone'}>Two Tone</MenuItem>
              <MenuItem value={'Bap 2'}>Bap 2</MenuItem>
              <MenuItem value={'Ress 2'}>Ress 2</MenuItem>
              <MenuItem value={'Body Shop'}>Body Shop</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <FormControl fullWidth>
            <InputLabel id='modalidadId'>Modalidad</InputLabel>
            <Select
              labelId='modalidadId'
              id='modalidadId'
              value={state.modalidad}
              label='Modalidad'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'modalidad',
                  value: event.target.value
                });
              }}
              >
              <MenuItem value={'Presencial'}>Presencial</MenuItem>
              <MenuItem value={'Videoconferencia'}>Videoconferencia</MenuItem>
              <MenuItem value={'Sitio'}>Sitio</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
            fullWidth
            label='Asunto de junta'
            value={state.temaAsunto}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'temaAsunto',
                value: event.target.value
              });
            }}
              />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Organizador de junta'
            value={state.organizador}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'organizador',
                value: event.target.value
              });
            }}
              />
          </Grid>
      </Grid>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
          <Grid item xs={12}>
            <Box marginTop={2} marginBottom={2}>
            <Divider variant="middle" />
            <Typography textAlign='center'>Registro de empresas y personal</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label='Empresas participantes'
              value={state.empresasParticipantes}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'empresasParticipantes',
                  value: event.target.value
                });
              }}
                />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label='Integrante de empresa'
              value={state.integranteEmpresa}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'integranteEmpresa',
                  value: event.target.value
                });
              }}
                />
          </Grid>
      </Grid>
      <Box marginBottom={2}></Box>

      <Grid item xs={12}>
        <Box display='flex' justifyContent='end'>
          <Button
            variant='contained'
            onClick={() => setRegistroEmpresa (value => {
              const registroEmpresa = [...value];
              registroEmpresa.push({
                empresasParticipantes: state.empresasParticipantes,
                integranteEmpresa: state.integranteEmpresa
              });
              return registroEmpresa;
            })}>Guardar</Button>
        </Box>
      </Grid>
      <Box marginBottom={2}></Box>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
          <Grid item xs={12}>
            <Box marginTop={2} marginBottom={2}>
            <Divider variant="middle" />
            <Typography textAlign='center'>Registro de eventos</Typography>
            </Box>
          </Grid>
      </Grid>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Id del tema'
            type= 'number'
            value={state.idTema}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'idTema',
                value: event.target.value
              });
            }}
              />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
            <InputLabel id='categoriaId'>Categoria del tema</InputLabel>
            <Select
              labelId='categoriaId'
              id='categoriaId'
              value={state.categoriaTema}
              label='Edificio'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'categoriaTema',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'Administracion'}>Administracion</MenuItem>
                <MenuItem value={'Ambiental'}>Abmiental</MenuItem>
                <MenuItem value={'Bim'}>Bim</MenuItem>
                <MenuItem value={'Calidad'}>Calidad</MenuItem>
                <MenuItem value={'Capacitacion / Entrenamiento'}>Capacitacion / Entrenamiento</MenuItem>
                <MenuItem value={'Close Out'}>Close Out</MenuItem>
                <MenuItem value={'Comisionamiento'}>Comisionamiento</MenuItem>
                <MenuItem value={'Contabilidad'}>Contabilidad</MenuItem>
                <MenuItem value={'Ingeniería'}>Ingeniería</MenuItem>
                <MenuItem value={'Instalación'}>Instalación</MenuItem>
                <MenuItem value={'Seguridad'}>Seguridad</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Empresa'
            value={state.idEmpresatema}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'idEmpresatema',
                value: event.target.value
              });
            }}/>
          </Grid>
          <Grid item xs={12}>
            <TextField
            fullWidth
            label='Tema'
            value={state.empresaTitulo}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'empresaTitulo',
                value: event.target.value
              });
            }}/>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Responsable del tema'
            value={state.responsableTema}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'responsableTema',
                value: event.target.value
              });
            }}/>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Compromiso de empresa'
            value={state.compromiso}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'compromiso',
                value: event.target.value
              });
            }}/>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Etiqueta'
              value={state.etiqueta}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'etiqueta',
                  value: event.target.value
                });
          }} />
          </Grid>
      </Grid>
      <Box marginBottom={2}></Box>
      <Grid item xs={12}>
        <Box display='flex' justifyContent='end'>
          <Button
            variant='contained'
            onClick={() => setRegistroEvento (value => {
              const registroEvento = [...value];
              registroEvento.push({
                idTema: state.idTema,
                categoriaTema: state.categoriaTema,
                empresaTitulo: state.empresaTitulo,
                idEmpresatema: state.idEmpresatema,
                responsableTema: state.responsableTema,
                compromiso: state.compromiso,
                etiqueta: state.etiqueta
              });
              return registroEvento;
            })}>Guardar</Button>
        </Box>
      </Grid>

      <Box marginBottom={5}></Box>
      <Box marginBottom={3}>
        <div>Fecha: {state.fecha}</div>
        <div>Hora de inicio de Junta: {state.horaInicio} hrs</div>
        <div>Hora de finalizacion de junta: {state.horafin} hrs</div>
        <div>Ubicacion: {state.ubicacion}</div>
        <div>Proyecto: {state.proyecto}</div>
        <div>Edificio: {state.edificio}</div>
        <div>Modalidad de junta: {state.modalidad}</div>
        <Typography
            variant='h6'
            color='black'
            textAlign='center'>
            {state.temaAsunto}
          </Typography>
        <div>Organizador de junta: {state.organizador}</div>
        <Box marginTop={1}></Box>
        <Divider variant="middle" />
        <Typography textAlign='center'>Empresas incluidas y personal en junta</Typography>
        <Grid
          container>
            <Box
              display='flex'
              flexDirection='column'
              marginTop={1}> 
              {
                registroEmpresa.map((i: RegistroEmpresas, index: number) => {
                  return (
                    <Grid
                      key={index}>
                        <Box>
                          <Typography>Empresa: {i.empresasParticipantes} Personal: {i.integranteEmpresa}</Typography>
                        </Box>
                    </Grid>
                  );
                })
              }
            </Box>
          </Grid>
          <Box marginTop={1}></Box>
          <Divider variant="middle" />
          <Typography textAlign='center'>Eventos vistos y revisados en la junta</Typography>
          <Grid>
            <Box
              marginTop={1}> 
              {
                registroEvento.map((i: RegistroEventos, index: number) => {
                  return (
                    <Grid
                      key={index}>
                        <Divider variant="middle" />
                        <Box padding={2}>
                          <Typography>Id Tema: {i.idTema}</Typography>
                          <Typography>Categoria: {i.categoriaTema}</Typography>
                          <Typography>Tema: {i.empresaTitulo}</Typography>
                          <Typography>Responsable del tema: {i.responsableTema}</Typography> 
                          <Typography>Empresa: {i.idEmpresatema}</Typography> 
                          <Typography>{i.compromiso ? `Compromiso de empresa: ${i.compromiso}` : ''}</Typography> 
                          <Typography>{`#${i.etiqueta} #${i.categoriaTema}`}</Typography> 
                        </Box>
                    </Grid>
                  );
                })
              }
            </Box>
          </Grid>
          <Box marginTop={3}/>
          <Divider variant="fullWidth" />
        <div>Se finaliza la junta con esta minuta con los puntos revisados y por revisar por parte de los presentes con fecha: {state.fecha} siendo las: {state.horafin} hrs</div>
      </Box>
    </div>
  );
};

export default MinutasDeJunta;
