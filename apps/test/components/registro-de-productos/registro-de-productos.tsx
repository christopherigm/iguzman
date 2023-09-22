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
  Registro,
  Reducer,
  InitialState,
} from './reducer';
import { Button, Grid } from '@mui/material';

const RegistroDeProductos = (): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [avance, setAvance] = useState<Array<Registro>>([]);
  return (
    <>
    <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
        <Grid item xs={12}>
          <Box display='flex' justifyContent='center'>
            <Typography variant='h4'>REGISTRO DE PRODUCTOS</Typography>
          </Box>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField 
            fullWidth
            label= 'Ingrese producto'
            value={state.nombre}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'nombre',
                value: event.target.value
              });
            }} />
        </Grid>
        <Grid item xs={12} sm={3}>
          <FormControl fullWidth>
              <InputLabel id='unidadId'>Unidad de Medision</InputLabel>
                <Select
                  labelId='unidadId'
                  id='unidadId'
                  value={state.unidadMedicion}
                  label='Unidad'
                  onChange={(event: SelectChangeEvent<string>) => {
                    dispatch({
                      type: 'input',
                      name: 'unidadMedicion',
                      value: event.target.value
                    });
                  }}>
                    <MenuItem value={'KG'}>Kilogramos</MenuItem>
                    <MenuItem value={'OZ'}>Onzas</MenuItem>
                    <MenuItem value={'GL'}>Galones</MenuItem>
                    <MenuItem value={'LT'}>Litros</MenuItem>
                    <MenuItem value={'ML'}>Mililitros</MenuItem>
                    <MenuItem value={'GR'}>Gramos</MenuItem>
                    <MenuItem value={'Pzas'}>Piezas</MenuItem>
                    <MenuItem value={''}>N/A</MenuItem>
                </Select>
            </FormControl>
        </Grid>
        <Grid item xs={12} sm={3}>
          <FormControl fullWidth>
              <InputLabel id='categoriaID'>Categoria del producto</InputLabel>
                <Select
                  labelId='categoriaID'
                  id='categoriaID'
                  value={state.categoria}
                  label='Categoria'
                  onChange={(event: SelectChangeEvent<string>) => {
                    dispatch({
                      type: 'input',
                      name: 'categoria',
                      value: event.target.value
                    });
                  }}>
                    <MenuItem value={'Verduras'}>Verduras / Vegetales</MenuItem>
                    <MenuItem value={'Frutas'}>Frutas</MenuItem>
                    <MenuItem value={'Cereales'}>Celerales</MenuItem>
                    <MenuItem value={'Lacteos'}>Lacteos</MenuItem>
                    <MenuItem value={'Condimentos'}>Condimentos</MenuItem>
                    <MenuItem value={'Saborizantes'}>Saborizantes</MenuItem>
                    <MenuItem value={'Carnes'}>Carnes</MenuItem>
                    <MenuItem value={'Aderesos'}>Aderesos</MenuItem>
                    <MenuItem value={'Aceites'}>Aceites</MenuItem>
                    <MenuItem value={'Leguminosas'}>Leguminosas</MenuItem>
                    <MenuItem value={'Harinas'}>Harinas</MenuItem>
                    <MenuItem value={'Solventes'}>Solventes</MenuItem>
                    <MenuItem value={'Pastas'}>Pastas</MenuItem>
                    <MenuItem value={'Sobres'}>Sobres</MenuItem>
                    <MenuItem value={'Chiles'}>Chiles</MenuItem>
                    <MenuItem value={'Otros'}>Otros</MenuItem>
                    <MenuItem value={'Accesorios'}>Accesorios</MenuItem>
                    <MenuItem value={'Vajilla'}>Vajilla</MenuItem>
                    <MenuItem value={''}>N/A</MenuItem>
                </Select>
            </FormControl>
        </Grid>
        <Grid item xs={12}>
          <Box display='flex' justifyContent='end'>
            <Button
              variant='contained'
              onClick={() => setAvance (value => {
                const avance = [...value];
                avance.push({
                  nombre: state.nombre,
                  unidadMedicion: state.unidadMedicion,
                  categoria: state.categoria,
                });
                return avance;
              })}>REGISTRAR</Button>
          </Box>
        </Grid>
      </Grid>
      <Grid
        container>
          {
            avance.map((i: Registro, index: number) => {
              return (
                <Grid
                  key={index}
                  item xs={12}>
                    <Box
                      padding={2}>
                      <Divider variant="middle" />
                      <Typography>Nombre del producto:{i.nombre}</Typography>
                      <Typography>Unidad de medision del producto:{i.unidadMedicion}</Typography>
                      <Typography>Categoria del producto:{i.categoria}</Typography>
                    </Box>
                </Grid>
              );
            })
          }
        </Grid>
    </>
  );
};

export default RegistroDeProductos;
