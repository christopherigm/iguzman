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
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Button, Grid, Paper } from '@mui/material';
import Divider from '@mui/material/Divider';
import { 
  State,
  RegistroRFI,
  InitialState,
  Reducer
} from './reducer';

const ReporteRfi = () => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [registroRFI, setRegistroRFi] = useState<Array<RegistroRFI>>([]);

  return(
    <>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center' marginBottom={2}>
              <Typography variant='h4'>REGISTRO DE RFI (REQUEST FOR INFORMATION)</Typography>
            </Box>
            <Divider variant="middle" />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Typography variant='body2'>Numero de RFI</Typography>
            <TextField
              fullWidth
              label= 'Numero de RFI'
              value={state.numeroRfi}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
                dispatch({
                  type: 'input',
                  name: 'numeroRfi',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant='body2'>Tema de RFI</Typography>
            <TextField
              fullWidth
              label='Tema del RFI'
              value={state.tema}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
                dispatch({
                  type: 'input',
                  name: 'tema',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Typography variant='body2'>Nivel de importancia RFI</Typography>
            <FormControl fullWidth>
              <InputLabel id='importanciaId'>Nivel de importancia RFI</InputLabel>
              <Select
                labelId='importanciaId'
                id='importanciaId'
                value={state.importancia}
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch({
                    type: 'input',
                    name: 'importancia',
                    value: event.target.value
                  });
                }}>
                  <MenuItem value={'Urgente'}>Urgente</MenuItem>
                  <MenuItem value={'Alto'}>Alto</MenuItem>
                  <MenuItem value={'Normal'}>Normal</MenuItem>
                  <MenuItem value={'Bajo'}>Bajo</MenuItem>
                </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
          <Typography variant='body2'>Fecha de emision de RFI</Typography>
          <TextField
            fullWidth
            type= 'date'
            value={state.fechaInicio}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
              dispatch({
                type: 'input',
                name: 'fechaInicio',
                value: event.target.value
              });
            }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Typography variant='body2'>Fecha de respuesta de RFI</Typography>
            <TextField
              fullWidth
              type= 'date'
              value={state.fechaRespuesta}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
                dispatch({
                  type: 'input',
                  name: 'fechaRespuesta',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel id='disciplinaId'>Disciplina de RFI</InputLabel>
              <Select
                labelId='disciplinaId'
                id='disciplinaId'
                value={state.disciplina}
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch({
                    type: 'input',
                    name: 'disciplina',
                    value: event.target.value
                  });
                }}>
                  <MenuItem value={'Civil'}>Civil</MenuItem>
                  <MenuItem value={'Arquitectonico'}>Arquitectonico</MenuItem>
                  <MenuItem value={'Estructual'}>Estructural</MenuItem>
                  <MenuItem value={'Mecanico'}>Mecanico</MenuItem>
                  <MenuItem value={'Sistema contra incendios'}>Sistema contra incendios</MenuItem>
                  <MenuItem value={'Aire acondicionado'}>Aire acondicionado</MenuItem>
                  <MenuItem value={'Plomeria'}>Plomeria</MenuItem>
                  <MenuItem value={'Electrico'}>Electrico</MenuItem>
                  <MenuItem value={'Otra'}>Otra</MenuItem>
                </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel id='categoriaId'>Categoria de RFI</InputLabel>
              <Select
                labelId='categoriaId'
                id='categoriaId'
                value={state.categoria}
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch({
                    type: 'input',
                    name: 'categoria',
                    value: event.target.value
                  });
                }}>
                  <MenuItem value={'Claridad de planos'}>Claridad en planos</MenuItem>
                  <MenuItem value={'Modificaciones de planos'}>Modificaciones de planos</MenuItem>
                  <MenuItem value={'Discrepancia en planos'}>Discrepancia en planos</MenuItem>
                  <MenuItem value={'Termino de programación'}>Termino de programación</MenuItem>
                  <MenuItem value={'Discrepancias de plan y especificaciónes'}>Discrepancias de plan y especificaciones</MenuItem>
                  <MenuItem value={'Clarificación de especificaciones'}>Clarificación de especificaciones</MenuItem>
                </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <FormControl fullWidth>
              <InputLabel id='companiaId'>Compania</InputLabel>
              <Select
                labelId='companiaId'
                id='companiaId'
                value={state.compania}
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch({
                    type: 'input',
                    name: 'compania',
                    value: event.target.value
                  });
                }} >
                  <MenuItem value={'Altatec'}>Altatec</MenuItem>
                  <MenuItem value={'Walbridge'}>Walbridge</MenuItem>
                  <MenuItem value={'GK'}>GK</MenuItem>
                  <MenuItem value={'General Motors'}>General Motors</MenuItem>
                  <MenuItem value={'Johnson Controls'}>Johnson Controls</MenuItem>
                </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label='Persona que emite'
              value={state.emitido}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
                dispatch({
                  type: 'input',
                  name: 'emitido',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={10}>
            <TextField
              fullWidth
              label='Pregunta en espanol'
              value={state.pregunta}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
                dispatch({
                  type: 'input',
                  name: 'pregunta',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label='Pregunta en ingles'
              value={state.preguntaIng}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>  {
                dispatch({
                  type: 'input',
                  name: 'preguntaIng',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='end'>
              <Button
                variant='contained'
                onClick={() => setRegistroRFi (value => {
                  const registroRFI = [...value];
                  registroRFI.push({
                    numeroRfi: state.numeroRfi,
                    tema: state.tema,
                    importancia: state.importancia,
                    fechaInicio: state.fechaInicio,
                    fechaRespuesta: state.fechaRespuesta,
                    disciplina: state.disciplina,
                    categoria: state.categoria,
                    compania: state.compania,
                    emitido: state.emitido,
                    pregunta: state.pregunta,
                    preguntaIng: state.preguntaIng
                  });
                  return registroRFI;
                })}>Guardar</Button>
            </Box>
          </Grid>
      </Grid>
      <Grid container>
        {
          registroRFI.map((i: RegistroRFI, index: number) => {
            return (
              <Grid
                key={index}
                marginBottom={1}
                item xs={12} sm={6}>
                  <Box padding={2} minWidth={500}>
                    <Paper elevation={3}>
                      <Box padding={2}>
                        <Typography>Numero RFI: {i.numeroRfi}</Typography>
                        <Typography>Tema: {i.tema}</Typography>
                        <Typography>Nivel de importamcia: {i.importancia}</Typography>
                        <Typography>Fecha de inicio: {i.fechaInicio}</Typography>
                        <Typography>Fecha de respuesta: {i.fechaRespuesta}</Typography>
                        <Typography>Disciplina: {i.disciplina}</Typography>
                        <Typography>Subdisciplina: {i.categoria}</Typography>
                        <Typography>Compania: {i.compania}</Typography>
                        <Typography>Rfi emitido por: {i.emitido}</Typography>
                        <Typography>Pregunta en espanol: {i.pregunta}</Typography>
                        <Typography>Pregunta en ingles: {i.preguntaIng}</Typography>
                      </Box>
                    </Paper>
                  </Box>
              </Grid>
            );
          })
        }
      </Grid>
    </>
  );
};

export default ReporteRfi;
