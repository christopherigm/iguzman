import React, {
  ReactElement,
  useState,
  useReducer
} from 'react';
import {Grid, Button, colors} from '@mui/material';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import {
  State,
  Reducer,
  InitialState,
  Etiquetas,
} from './reducer';

const CompositorDeCorreos = (): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [etiquetas, setEtiqueta] =  useState<Array<Etiquetas>>([]);
  return (
    <>
      <Grid 
        container
        rowSpacing={2}
        columnSpacing={2}>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='h4'>COMPOSITOR DE CORREOS</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Typography variant='body2'>Fecha de correo</Typography>
            <TextField
              fullWidth
              label=''
              value={state.fecha}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'fecha',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box marginTop={2.5}>
              <TextField
                    fullWidth
                    label='Nombre del receptor del correo'
                    value={state.receptor}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      dispatch ({
                        type: 'input',
                        name: 'receptor',
                        value: event.target.value
                      });
                    }} />
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box marginTop={2.5}>
              <FormControl fullWidth>
                <InputLabel id='empresaEmisorId'>Empresa del receptor</InputLabel>
                <Select
                  labelId='empresaEmisorId'
                  id='empresaEmisorId'
                  value={state.empresaReceptor}
                  label='Empresa del receptor'
                  onChange={(event: SelectChangeEvent<string>) => {
                    dispatch ({
                      type: 'input',
                      name: 'empresaReceptor',
                      value: event.target.value
                    });
                  }} >
                    <MenuItem value={'ALTATEC'}>Altatec</MenuItem>
                    <MenuItem value={'WALBRIDGE'}>Walbridge</MenuItem>
                    <MenuItem value={'JOHNSON CONTROLS'}>Johnson Controls</MenuItem>
                    <MenuItem value={''}>N/A</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box marginTop={2.5}>
              <TextField
                    fullWidth
                    label='Otra empresa'
                    value={state.otraEmpresa}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      dispatch ({
                        type: 'input',
                        name: 'otraEmpresa',
                        value: event.target.value
                      });
                    }} />
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel id='proyectoId'>Proyecto</InputLabel>
              <Select
                labelId='proyectoId'
                id='proyectoId'
                value={state.proyecto}
                label='Proyecto'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch ({
                    type: 'input',
                    name: 'proyecto',
                    value: event.target.value
                  });
                }} >
                  <MenuItem value={'GM RAMOS'}>GM RAMOS ARIZPE</MenuItem>
                  <MenuItem value={'GM SLP'}>GM SAN LUIS POTOSI</MenuItem>
                  <MenuItem value={'GM SILAO'}>GM SILAO</MenuItem>
                  <MenuItem value={''}>N/A</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel id='edificioId'>edificio</InputLabel>
              <Select
                labelId='edificioId'
                id='edificioId'
                value={state.edificio}
                label='Edificio'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch ({
                    type: 'input',
                    name: 'edificio',
                    value: event.target.value
                  });
                }} >
                <MenuItem value={'TWO TONE'}>Two Tone</MenuItem>
                <MenuItem value={'BAP2'}>Bap 2</MenuItem>
                <MenuItem value={'RESS 2'}>Ress 2</MenuItem>
                <MenuItem value={'GA'}>GA</MenuItem>
                <MenuItem value={'BODY SHOP'}>Body Shop</MenuItem>
                <MenuItem value={'EDU'}>Gps1</MenuItem>
                <MenuItem value={'GEARS'}>Gears</MenuItem>
                <MenuItem value={'HEAT TREAT'}>Heat Treat</MenuItem>
                <MenuItem value={'PAINT SHOP'}>Paint Shop</MenuItem>
                <MenuItem value={''}>N/A</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel id='ubicacionId'>Ubicacion de proyecto</InputLabel>
              <Select
                labelId='ubicacionId'
                id='ubicacionId'
                value={state.ubicacion}
                label='Ubicacion de proyecto'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch ({
                    type: 'input',
                    name: 'ubicacion',
                    value: event.target.value
                  });
                }} >
                  <MenuItem value={'Ramos Arizpe, Coahuila México'}>RAMOS ARIZPE</MenuItem>
                  <MenuItem value={'San Luis Potosí, México'}>SAN LUIS POTOSI</MenuItem>
                  <MenuItem value={'Silao, México'}>SILAO</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
                  fullWidth
                  label='Asunto de correo'
                  value={state.asunto}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch ({
                      type: 'input',
                      name: 'asunto',
                      value: event.target.value
                    });
                  }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
                  fullWidth
                  label='No. seguimiento'
                  value={state.numeroSeguimiento}
                  type='number'
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                    dispatch ({
                      type: 'input',
                      name: 'numeroSeguimiento',
                      value: event.target.value
                    });
                  }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel id='categoriaId'>Categoria de correo</InputLabel>
              <Select
                labelId='categoriaId'
                id='categoriaId'
                value={state.categoria}
                label='Categoria de proyecto'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch ({
                    type: 'input',
                    name: 'categoria',
                    value: event.target.value
                  });
                }} >
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
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel id='disciplinaId'>Disciplina/Sistema</InputLabel>
              <Select
                labelId='disciplinaId'
                id='disciplinaId'
                value={state.disciplina}
                label='Disciplina/Sistena'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch ({
                    type: 'input',
                    name: 'disciplina',
                    value: event.target.value
                  });
                }} >
                <MenuItem value={'Videovigilancia'}>VideoVigilancia</MenuItem>
                <MenuItem value={'Control de Acceso'}>Control de Acceso</MenuItem>
                <MenuItem value={'Alarma contra incendios'}>Fire Alarm System</MenuItem>
                <MenuItem value={'General'}>General</MenuItem>
                <MenuItem value={''}>N/A</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
                  fullWidth
                  label='Link addicional'
                  value={state.link}
                  type='url'
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch ({
                      type: 'input',
                      name: 'link',
                      value: event.target.value
                    });
                  }} />
          </Grid>
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel id='introduccionId'>Introduccion opcional</InputLabel>
              <Select
                labelId='introduccionId'
                id='introduccionId'
                value={state.introduccion}
                label='Ubicacion de proyecto'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch ({
                    type: 'input',
                    name: 'introduccion',
                    value: event.target.value
                  });
                }} >
                  <MenuItem value={`Adjunto la información del departamento: ${state.categoria}  correspondiente/ solicitada  del tema: ${state.asunto}. Como siempre quedo a tu disposición para cualquier consulta o revisión de la mima. `}>Entrega de información Consecutiva</MenuItem>
                  <MenuItem value={`Espero que se encuentre bien. Me permito escribirle para solicitar la siguiente información del depto: ${state.categoria} ${state.asunto} Agradecería mucho si pudiera proporcionarme esta información a la brevedad posible. Si necesitas más detalles o aclaraciones sobre lo que se requiere, por favor házmelo saber.`}>Solicitud de información</MenuItem>
                  <MenuItem value={`Es un placer informarte que te envío la información: ${state.asunto} Por favor, revisa la información adjunta y no dudes en contactarme si necesitas mas detalles o tienes alguna pregunta relacionada. `}>Entrega de información</MenuItem>
                  <MenuItem value={`Espero que te encuentres bien. Quería realizar un seguimiento en relación a:${state.asunto} Me gustaría saber si has tenido oportunidad de revisar la información o avanzar con la misma, y si tienes alguna pregunta o comentario al respecto, será de gran importancia.
                                    Por favor, tomate un momento para proporcionar cualquier actualización que consideres relevante, o si necesitas más detalles, estaré encantado de proporcionártelos. 
                                    `}>Seguimiento de información</MenuItem>
                  <MenuItem value={`Espero que te encuentres bien. Te escribo para solicitarte una respuesta en relación a: ${state.asunto}  Agradecería mucho si pudieras tomar un momento para proporcionar tu opinión, confirmación o cualquier información relevante. Tu respuesta es importante para poder avanzar`}>Solicitud de respuesta</MenuItem>
                  <MenuItem value={`Espero que te encuentres bien. Quisiera solicitar una junta para: ${state.fecha} con la finalidad de: ${state.asunto}  quedo atento a tu respuesta para confirmar y concretar la junta`}>Solicitud de junta</MenuItem>
                  <MenuItem value={`Espero que te encuentres bien. Te hago llegar la minuta de la junta: ${state.asunto} con fecha: ${state.fecha} con todos los temas vistos o revisados en la misma. Si tienes alguna duda o consulta, por favor házmelo saber. `}>Entrega de minuta de junta</MenuItem>
                  <MenuItem value={`Confirmo el recibo de información por parte de usted con respecto al depto: ${state.categoria} me tomare el tiempo de revisar la misma, en caso de tener dudas o comentarios al respecto, me pondré en contacto con usted.`}>Confirmación de recibimiento de información</MenuItem>
                  <MenuItem value={`Realizo los ajustes correspondientes sobre la información revisada/solicitada de:${state.asunto}  en cuanto tenga la información actualizada, se la are llegar.`}>Realización de ajustes de acuerdo a información recibida</MenuItem>
                  <MenuItem value={''}>N/A</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
                  fullWidth
                  label='Comentario'
                  value={state.comentario}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch ({
                      type: 'input',
                      name: 'comentario',
                      value: event.target.value
                    });
                  }} />
          </Grid>
          <Grid item xs={12} sm={9}>
            <TextField
                  fullWidth
                  label='Anexo de correo'
                  value={state.anexo}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch ({
                      type: 'input',
                      name: 'anexo',
                      value: event.target.value
                    });
                  }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel id='cierreId'>Cierre de correo</InputLabel>
              <Select
                labelId='cierreId'
                id='cierreId'
                value={state.cierreCorreo}
                label='Cierre de correo'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch ({
                    type: 'input',
                    name: 'cierreCorreo',
                    value: event.target.value
                  });
                }} >
                <MenuItem value={'Si no más por el momento, quedo a sus ordenes saludos.'}>Saludos cordiales</MenuItem>
                <MenuItem value={'En espera de su respuesta, saludos.'}>En espera de repuesta</MenuItem>
                <MenuItem value={'En espera de sus comentarios y/u Observaciones, saludos'}>En espera de comentarios</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={9}>
            <Box display={'flex'} justifyContent={'end'}>
              <Button
                variant='contained'
                style={{background: '#ff5722'}}
                onClick={() => setEtiqueta (value => {
                  const etiquetas = [...value];
                  etiquetas.push({
                    etiqueta: state.etiqueta,
                  });
                  return etiquetas;
                })} >GUARDAR</Button>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label='Etiquetas'
              value={state.etiqueta}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'etiqueta',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography>Titulo de correo</Typography>
            </Box>
            <Typography style={{color: '#01579b', fontWeight: '600'}}>{`${state.proyecto} I ${state.edificio} I ALTATEC I ${state.fecha} I ${state.asunto}`}</Typography>
          </Grid>
          <Grid item xs={12}>
            <div>Fecha: {state.fecha}</div>
            <div>{state.proyecto ? `Proyecto: ${state.proyecto}` : ''}</div>
            <div>{state.edificio ? `Edificio: ${state.edificio}` : ''}</div>
            <div>{state.ubicacion ? `Ubicación: ${state.ubicacion}` : ''}</div>
            <div>Asunto de correo: {state.asunto}</div>
            <div>Numero de seguimiento de correo: {state.numeroSeguimiento}</div>
            <div style={{color: '#01579b', fontWeight: '600'}}>Categoria del correo: {state.categoria}</div>
            <div>{state.disciplina ? `Disciplina o sistema: ${state.disciplina}` : ''}</div>
            <div>Receptor(a): {state.receptor}</div>
            <div>Empresa del receptor(a): {state.otraEmpresa ? state.otraEmpresa : state.empresaReceptor}</div>
            <Box marginTop={2} marginBottom={2}>
              <Divider variant="middle" />
            </Box>
            <div>Estimado(a): {state.receptor}</div>
            <div>{state.introduccion? state.introduccion : ''}</div>
            <div>{state.comentario}</div>
            <Box marginTop={2} marginBottom={2}>
              <Divider variant="middle" />
            </Box>
            <div>{state.anexo ? `Anexo de correo: ${state.anexo}` : ''}</div>
            <div>{state.link ? `Link anexo: ${state.link}` : ''}</div>
            <div>{state.cierreCorreo}</div>
            <div>Etiquetas de rastreo de correo:
              {
                etiquetas.map((i: Etiquetas, index: number) => {
                  return (
                    <span key={index} style={{color: 'red'}}>{` #${i.etiqueta} `}</span>
                  );
                })
              }
            </div>
          </Grid>
      </Grid>
    </>
  );
};

export default CompositorDeCorreos;
