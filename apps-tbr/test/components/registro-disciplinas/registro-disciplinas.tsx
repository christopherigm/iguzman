import React, { useReducer, useState } from 'react';
import { InitialState, Reducer, RegistroDisciplina } from './reducer';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import { Button, Grid, Paper } from '@mui/material';

const RegistroDeDisciplinas = () => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [disciplina, setDisciplina] = useState <Array<RegistroDisciplina>>([]);
  return (
    <>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2} >
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='h4'>REGISTRO DE DISCIPLINAS</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant='body2'>Disciplina</Typography>
            <TextField
              fullWidth
              label='Disciplina'
              value={state.disciplina}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'disciplina',
                  value: event.target.value,
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant='body2'>SubDisciplina</Typography>
            <TextField
              fullWidth
              label='SubDisciplina'
              value={state.subDisciplina}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'subDisciplina',
                  value: event.target.value,
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant='body2'>Fecha de inicio</Typography>
            <TextField
              fullWidth
              type='date'
              value={state.fechaInicio}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'fechaInicio',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant='body2'>Fecha de finalizacion</Typography>
              <TextField
                fullWidth
                type='date'
                value={state.fechaFin}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  dispatch({
                    type: 'input',
                    name: 'fechaFin',
                    value: event.target.value
                  });
                }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant='body2'>Supervisor a cargo</Typography>
            <TextField
              fullWidth
              label='Supervisor'
              value={state.responsable}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'responsable',
                  value: event.target.value,
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='end'>
              <Button
                variant='contained'
                onClick={() => setDisciplina (value => {
                  const disciplina = [...value];
                  disciplina.push({
                    disciplina: state.disciplina,
                    subDisciplina: state.subDisciplina,
                    fechaInicio: state.fechaInicio,
                    fechaFin: state.fechaFin,
                    responsable: state.responsable
                  });
                  return disciplina;
                })}>GUARDAR</Button>
            </Box>
          </Grid>
      </Grid>
      <Grid>
        <Box
          display='flex'
          flexDirection='row'
          flexWrap='wrap'
          justifyContent='space-evenly'
          marginTop={5} >
            {
              disciplina.map((i: RegistroDisciplina, index: number) => {
                return (
                  <Grid
                    key={index}
                    item xs={12} sm={6}>
                      <Box padding={2} minWidth={300}>
                        <Paper elevation={3}>
                          <Box padding={2}>
                            <Typography>Disciplina: {i.disciplina}</Typography>
                            <Typography>SubDisciplina: {i.subDisciplina}</Typography>
                            <Typography>Fecha de inicio: {i.fechaInicio}</Typography>
                            <Typography>Fecha de finalizacion: {i.fechaFin}</Typography>
                            <Typography>Supervisor a cargo: {i.responsable}</Typography>
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

export default RegistroDeDisciplinas;
