import React, {
  ReactElement,
  useState,
  useReducer
} from 'react';
import { 
  InitialState,
  RegistroPersonal,
  Reducer 
} from './reducer';
import {Grid, Button, colors} from '@mui/material';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

const RegistroDePersonal = (): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [registroPersonal, setRegistroPersonal] = useState<Array<RegistroPersonal>>([]);
  return (
    <>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2} >
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='h4'>REGISTRO DE PERSONAL</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Nombre(s)'
              value={state.nombres}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'nombres',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Apellido paterno'
              value={state.apellidoPaterno}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'apellidoPaterno',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Apellido materno'
              value={state.apellidoMaterno}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'apellidoMaterno',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label=''
              value={state.anioNacimiento}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'anioNacimiento',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Numero de empleado'
              value={state.numeroEmpleado}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'numeroEmpleado',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel id='puestoId'>Clasificacion laboral</InputLabel>
              <Select
                labelId='puestoId'
                id='puestoId'
                value={state.clasificacion}
                label='Clasificacion laboral'
                onChange={(event: SelectChangeEvent<string>) => {
                  dispatch ({
                    type: 'input',
                    name: 'clasificacion',
                    value: event.target.value
                  });
                }} >
                  <MenuItem value={'Administrativo'}>Administrativo</MenuItem>
                  <MenuItem value={'Aux. Residente'}>Aux. Residente</MenuItem>
                  <MenuItem value={'Ayudante general'}>Ayudante general</MenuItem>
                  <MenuItem value={'Cabo'}>Cabo</MenuItem>
                  <MenuItem value={'Coordinador de seguridad'}>Coordinador de seguridad</MenuItem>
                  <MenuItem value={'Bim, Arquitecto'}>Bim, Arquitecto</MenuItem>
                  <MenuItem value={'Montador'}>Montador</MenuItem>
                  <MenuItem value={'Operador'}>Operador</MenuItem>
                  <MenuItem value={'Paramedico'}>Paramedico</MenuItem>
                  <MenuItem value={'Coordinador de proyecto'}>Coordinador de proyecto</MenuItem>
                  <MenuItem value={'Ingeniero de proyecto'}>Ingeniero de proyecto</MenuItem>
                  <MenuItem value={'Tecnico'}>Tecnico</MenuItem>
                  <MenuItem value={'Seguridad'}>Seguridad</MenuItem>
                  <MenuItem value={'Supervisor Ambiental'}>Supervisor ambiental</MenuItem>
                  <MenuItem value={'Soldador'}>Soldador</MenuItem>
                  <MenuItem value={'Supervisor'}>Supervisor</MenuItem>
                  <MenuItem value={'Otro'}>Otro</MenuItem>
                  <MenuItem value={''}>N/A</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Puesto laboral'
              value={state.puesto}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'puesto',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Proyecto asignado'
              value={state.proyecto}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'proyecto',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Numero de contrato'
              value={state.numContrato}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'numContrato',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Box display={'flex'} justifyContent={'center'}>
              <Typography>Monitoreo de personal</Typography>
            </Box>
            <Box display={'flex'} justifyContent={'center'}>
              <FormControlLabel control={<Checkbox/>} label="Si" />
              <FormControlLabel control={<Checkbox/>} label="No" />
            </Box>
          </Grid>
      </Grid>
      <Box marginTop={2} marginBottom={2}>
        <Divider variant='middle'>INFORMACION ADICIONAL DEL PERSONAL</Divider>
      </Box>
      <Grid
      container
      rowSpacing={2}
      columnSpacing={2}>
         <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Numero de telefono'
              value={state.telefono}
              type='tel'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'telefono',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Correo electronico'
              value={state.correo}
              type='email'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'correo',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Calle de domicilio'
              value={state.calle}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'calle',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label='Numero exterior'
              value={state.numeroExt}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'numeroExt',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label='Numero interior'
              value={state.numInt}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'numInt',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label='Codigo postal'
              value={state.codigoPostal}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'codigoPostal',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Colonia'
              value={state.colonia}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'colonia',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Ciudad'
              value={state.ciudad}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'ciudad',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label='Pais'
              value={state.pais}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch ({
                  type: 'input',
                  name: 'pais',
                  value: event.target.value
                });
              }} />
          </Grid>
        <Grid item xs={12} sm={4}>
          <Box display={'flex'} justifyContent={'center'}>
            <Button
              variant='contained'
              onClick={() => setRegistroPersonal (value => {
                const registroPersonal = [...value];
                registroPersonal.push({
                  nombres: state.nombres,
                  apellidoPaterno: state.apellidoPaterno,
                  apellidoMaterno: state.apellidoMaterno,
                  anioNacimiento: state.anioNacimiento,
                  numeroSeguro: state.numeroSeguro,
                  numeroEmpleado: state.numeroEmpleado,
                  clasificacion: state.clasificacion,
                  puesto: state.puesto,
                  proyecto: state.proyecto,
                  numContrato: state.numContrato,
                  monitoreo: state.monitoreo,
                  telefono: state.telefono,
                  correo: state.correo,
                  calle: state.calle,
                  numeroExt: state.numeroExt,
                  numInt: state.numInt,
                  codigoPostal: state.codigoPostal,
                  colonia: state.colonia,
                  ciudad: state.ciudad,
                  pais: state.pais
                });
                return registroPersonal;
              })} >REGISTRAR PERSONAL</Button>
          </Box>
        </Grid>  
      </Grid>
      <Box marginTop={4} marginBottom={2}>
        <Divider variant='middle'>LISTADO DE PERSONAL REGISTRADO</Divider>
      </Box>
      <Box>
        {
          registroPersonal.map((i: RegistroPersonal, index: number) => {
            return (
              <Box>
                <Box>{`Nombre del empleado: ${i.nombres} ${i.apellidoPaterno} ${i.apellidoMaterno}.`}</Box>
                <Box>Fecha de nacimiento: {i.anioNacimiento}</Box>
                <Box>Numero de empleado: {i.numeroEmpleado}</Box>
                <Box>{`Clasificacion laboral: ${i.clasificacion} Puesto: ${i.puesto}`}</Box>
                <Box>{`Proyecto asignado: ${i.proyecto}. Numero de contrato: ${i.numContrato}`}</Box>
                <Box>{`Telefono: ${i.telefono} Email: ${i.correo}`}</Box>
                <Box>{`Direccion: ${i.calle} `}{i.numeroExt ? `N°. Exterior: ${i.numeroExt}` : ''}{i.numInt ? `N°. Interior: ${i.numInt}` : ''}{` Colonia: ${i.colonia},`}{` Ciudad: ${i.ciudad} Pais: ${i.pais}`}</Box>
                <Box marginTop={2} marginBottom={2}>
                  <Divider variant='fullWidth'/>
                </Box>
              </Box>
            );
          })
        }
      </Box>
    </>
  );
};

export default RegistroDePersonal;
