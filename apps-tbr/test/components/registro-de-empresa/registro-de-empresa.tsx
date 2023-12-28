import React, {
  ReactElement,
  useState,
  useReducer,
} from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  State,
  RegistroEmpresa,
  Reducer,
  InitialState,
} from './reducer';
import { Button, Grid, Paper } from '@mui/material';

const RegistroDeEmpresa = (): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [empresa, setEmpresa] = useState<Array<RegistroEmpresa>>([]);
  return (
    <>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='h4'>REGISTRO DE EMPRESAS</Typography>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='body1'>Datos fiscales generales</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Nombre de empresa'
              value={state.nombreEmpresa}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'nombreEmpresa',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'RFC de empresa'
              value={state.rfcEmpresa}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'rfcEmpresa',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Sector o giro de empresa'
              value={state.sectorGiroEmpresa}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'sectorGiroEmpresa',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Regimen fiscal de la empresa'
              value={state.regimenFiscal}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'regimenFiscal',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='body1'>Registro de direccion empresarial</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Calle o avenida'
              value={state.calle}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'calle',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label= 'Numero Exterior'
              value={state.numeroExterior}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'numeroExterior',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label= 'Numero interior'
              value={state.numeroInterior}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'numeroInterior',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Colonia'
              value={state.colonia}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'colonia',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Localidad, edo, condado'
              value={state.localidad}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'localidad',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Entidad federativa'
              value={state.entidad}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'entidad',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label= 'Codigo Postal'
              value={state.codigoPostal}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'codigoPostal',
                  value: event.target.value
                });
              }} />
          </Grid>
          

          <Grid item xs={12}>
            <Box display='flex' justifyContent='end'>
              <Button
                variant='contained'
                onClick={() => setEmpresa (value => {
                  const empresa = [...value];
                  empresa.push({
                    nombreEmpresa: state.nombreEmpresa,
                    rfcEmpresa: state.rfcEmpresa,
                    sectorGiroEmpresa: state.sectorGiroEmpresa,
                    regimenFiscal: state.regimenFiscal,
                    calle: state.calle,
                    numeroExterior: state.numeroExterior,
                    numeroInterior: state.numeroInterior,
                    colonia: state.colonia,
                    localidad: state.localidad,
                    entidad: state.entidad,
                    codigoPostal: state.codigoPostal
                  });
                  return empresa;
                })} >Registrar empresa</Button>
            </Box>
          </Grid>
          <Grid container>
            <Box 
              display='flex'
              flexDirection='row'
              flexWrap='wrap'
              justifyContent='space-between'
              marginTop={5} >
                {
                  empresa.map((i: RegistroEmpresa, index: number) => {
                    return (
                      <Grid
                      key={index}
                      marginBottom={3}
                      item xs={12} sm={6}>
                        <Box padding={2}>
                          <Paper elevation={3}>
                            <Box padding={2}>
                              <Typography>Empresa: {i.nombreEmpresa}</Typography>
                              <Typography>RFC: {i.rfcEmpresa}</Typography>
                              <Typography>Giro de empresa: {i.sectorGiroEmpresa}</Typography>
                              <Typography>Regimen Fiscal: {i.regimenFiscal}</Typography>
                              <Typography>
                                Direccion: {i.calle} 
                                {i.numeroExterior ? `Numero exterior: ${i.numeroExterior}` : '' }
                                {i.numeroInterior ? `Numero interior: ${i.numeroInterior}` : ''}
                                Colonia: {i.colonia} , Localidad: {i.localidad} {i.entidad}. Codigo postal: {i.codigoPostal}
                              </Typography>
                            </Box>
                          </Paper>
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

export default RegistroDeEmpresa;
