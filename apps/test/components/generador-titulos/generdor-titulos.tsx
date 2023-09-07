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
import { Button, Grid, Paper } from '@mui/material';
import Typography from '@mui/material/Typography';
import {
  State,
  Reducer,
  InitialState,
} from './reducer';

const GeneradorTitulos = (): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  return(
    <>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='h4'>GENERADOR DE TITULOS</Typography>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='body1'>Titulos de correo y archivos</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='proyectoId' >Proyecto</InputLabel>
            <Select
              labelId='proyectoId'
              id='proyectoId'
              value={state.proyecto}
              label='Proyecto'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'proyecto',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'GM RAMOS'}>GM RAMOS</MenuItem>
                <MenuItem value={'GM SLP'}>GM SLP</MenuItem>
                <MenuItem value={'GM SILAO'}>GM SILAO</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='edificioId' >Edificio</InputLabel>
            <Select
              labelId='edificioId'
              id='edificioId'
              value={state.edificio}
              label='Proyecto'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'edificio',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'TWO TONE'}>Two Tone</MenuItem>
                <MenuItem value={'BAP2'}>Bap 2</MenuItem>
                <MenuItem value={'RESS 2'}>Ress 2</MenuItem>
                <MenuItem value={'GA'}>GA</MenuItem>
                <MenuItem value={'BODY SHOP'}>Body Shop</MenuItem>
                <MenuItem value={'EDU'}>Gps1</MenuItem>
                <MenuItem value={'GEARS'}>Gears</MenuItem>
                <MenuItem value={'HEAT TREAT'}>Heat Treat</MenuItem>
                <MenuItem value={'PAINT SHOP'}>Paint Shop</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
            <InputLabel id='empresaId' >Empresa</InputLabel>
            <Select
              labelId='empresaId'
              id='empresaId'
              value={state.empresa}
              label='Proyecto'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'empresa',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'ALTATEC'}>Altatec</MenuItem>
                <MenuItem value={'WALBRIDGE'}>Walbridge</MenuItem>
                <MenuItem value={'JOHNSON CONTROLS'}>Johnson Controls</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label=''
              value={state.fecha}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'fecha',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
            <InputLabel id='tituloId' >Titulo</InputLabel>
            <Select
              labelId='tituloId'
              id='tituloId'
              value={state.titulo}
              label='Proyecto'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'titulo',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'REPORTE DE MODELADO BIM'}>REPORTE BIM</MenuItem>
                <MenuItem value={'CAMBIOS EN EL MODELO BIM'}>CAMBIOS EN BIM</MenuItem>
                <MenuItem value={'CIERRE DE MODELO BIM'}>CIERRE DE MODELO</MenuItem>
                <MenuItem value={'PLANOS ASBUILT'}>PLANOS ASBUILT</MenuItem>
                <MenuItem value={'PLANOS DE TALLER'}>PLANOS DE TALLER</MenuItem>
                <MenuItem value={'PLANOS DE'}>PLANOS</MenuItem>
                <MenuItem value={'RED LINES'}>RED LINES</MenuItem>
                <MenuItem value={'RFI DE'}>RFI</MenuItem>
                <MenuItem value={'RECORRIDO EN SITIO PARA'}>RECORRIDO EN SITIO</MenuItem>
                <MenuItem value={'REVISION DE'}>REVISION</MenuItem>
                <MenuItem value={'REPORTES DE'}>REPORTES</MenuItem>
                <MenuItem value={'INFORMACION SEMANAL'}>INFORMACION SEMANAL</MenuItem>
                <MenuItem value={'PUNCH LIST'}>PUNCH LIST</MenuItem>
                <MenuItem value={'JUNTA'}>JUNTA</MenuItem>
                <MenuItem value={'ACCESOS'}>ACCESOS</MenuItem>
                <MenuItem value={''}>N/A</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Comentario'
            value={state.comentario}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'comentario',
                value: event.target.value
              });
            }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label='Revision de correo'
              type='number'
              value={state.revision}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'revision',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Typography
            variant='h6'
            color='blue'
            textAlign='center'>
            Resultado titulo
            </Typography>
            <div>{state.proyecto} {state.edificio} I {state.empresa} I {state.fecha} {state.titulo} {state.comentario} {state.revision ? `REV-${state.revision}` : ''}</div>
          </Grid>
          <Box marginBottom={3}></Box>
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='body1'>Titulos de Red Lines y Asbuilt</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label='Numero de plano'
              value={state.numeroPlano}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'numeroPlano',
                  value: event.target.value
                });
              }} />
          </Grid>




          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='tipoTituloId' >Tipo de titulo</InputLabel>
            <Select
              labelId='tipoTituloId'
              id='tipoTituloId'
              value={state.tipoTitulo}
              label='Tipo de titulo'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'tipoTitulo',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'RED LINE'}>RED LINE</MenuItem>
                <MenuItem value={'ASBUILT'}>ASBUILT</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label=''
              value={state.fecha}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'fecha',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label='Iniciales de empresa'
              value={state.iniciales}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'iniciales',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Typography
            variant='h6'
            color='blue'
            textAlign='center'>
            Resultado titulo
            </Typography>
            <div>{state.numeroPlano}-{state.tipoTitulo}-{state.fecha}-{state.iniciales}</div>
          </Grid>




          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='body1'>Titulos de planos</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={2}>
            <FormControl fullWidth>
            <InputLabel id='proyectoId' >Proyecto</InputLabel>
            <Select
              labelId='proyectoId'
              id='proyectoId'
              value={state.proyecto}
              label='Proyecto'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'proyecto',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'GM RAMOS'}>GM RAMOS</MenuItem>
                <MenuItem value={'GM SLP'}>GM SLP</MenuItem>
                <MenuItem value={'GM SILAO'}>GM SILAO</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <FormControl fullWidth>
            <InputLabel id='edificioId' >Edificio</InputLabel>
            <Select
              labelId='edificioId'
              id='edificioId'
              value={state.edificio}
              label='Proyecto'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'edificio',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'TWO TONE'}>Two Tone</MenuItem>
                <MenuItem value={'BAP2'}>Bap 2</MenuItem>
                <MenuItem value={'RESS 2'}>Ress 2</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label=''
              value={state.fecha}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'fecha',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
            <InputLabel id='sistemaId' >Sistema</InputLabel>
            <Select
              labelId='sistemaId'
              id='edificioId'
              value={state.sistema}
              label='Sistema'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'sistema',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'VIDEO SURVEILLANCE SYSTEM'}>VIDEO SURVEILLANCE SYSTEM</MenuItem>
                <MenuItem value={'ACCESS CONTROL SYSTEM'}>ACCESS CONTROL SYSTEM</MenuItem>
                <MenuItem value={'FIRE ALARM SYSTEM'}>FIRE ALARM SYSTEM</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label='Numero de revision'
              type='number'
              value={state.revision}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'revision',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Typography
            variant='h6'
            color='blue'
            textAlign='center'>
            Resultado titulo
            </Typography>
            <div>SD-{state.proyecto}-{state.edificio}-{state.fecha}-{state.sistema}-REV{state.revision}</div>
          </Grid>



          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='body1'>Titulos de archivos</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label=''
              value={state.fecha}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'fecha',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <FormControl fullWidth>
            <InputLabel id='formatoId' >Nombre de formato o archivo</InputLabel>
            <Select
              labelId='formatoId'
              id='formatoId'
              value={state.formato}
              label='Formato o archivo'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'formato',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'VPLAN'}>Vplan</MenuItem>
                <MenuItem value={'4WLA'}>4 Weks</MenuItem>
                <MenuItem value={'PROGRAMA DE OBRA'}>Programa de obra</MenuItem>
                <MenuItem value={'CURVA DE PRODUCTIVIDAD'}>Curva de productividad</MenuItem>
                <MenuItem value={'MSR'}>Material status repport</MenuItem>
                <MenuItem value={'DIALY WORK'}>Reporte Diario</MenuItem>
                <MenuItem value={''}>NA</MenuItem>
            </Select>
            </FormControl>
          </Grid> 
          <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Otro nombre'
            value={state.comentario}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'comentario',
                value: event.target.value
              });
            }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
            <InputLabel id='edificioId' >Edificio</InputLabel>
            <Select
              labelId='edificioId'
              id='edificioId'
              value={state.edificio}
              label='Proyecto'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'edificio',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'TWO TONE'}>Two Tone</MenuItem>
                <MenuItem value={'BAP2'}>Bap 2</MenuItem>
                <MenuItem value={'RESS 2'}>Ress 2</MenuItem>
                <MenuItem value={'GA'}>GA</MenuItem>
                <MenuItem value={'BODY SHOP'}>Body Shop</MenuItem>
                <MenuItem value={'EDU'}>Gps1</MenuItem>
                <MenuItem value={'GEARS'}>Gears</MenuItem>
                <MenuItem value={'HEAT TREAT'}>Heat Treat</MenuItem>
                <MenuItem value={'PAINT SHOP'}>Paint Shop</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='sistemaId' >Sistema</InputLabel>
            <Select
              labelId='sistemaId'
              id='edificioId'
              value={state.sistema}
              label='Sistema'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'sistema',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'VSS'}>VIDEO SURVEILLANCE SYSTEM</MenuItem>
                <MenuItem value={'ACS'}>ACCESS CONTROL SYSTEM</MenuItem>
                <MenuItem value={'FAS'}>FIRE ALARM SYSTEM</MenuItem>
                <MenuItem value={'GENERAL'}>GENERAL</MenuItem>
                <MenuItem value={''}>N/A</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='empresaId' >Empresa</InputLabel>
            <Select
              labelId='empresaId'
              id='empresaId'
              value={state.empresa}
              label='Proyecto'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'empresa',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'ALTATEC'}>Altatec</MenuItem>
                <MenuItem value={'WALBRIDGE'}>Walbridge</MenuItem>
                <MenuItem value={'JOHNSON CONTROLS'}>Johnson Controls</MenuItem>
            </Select>
            </FormControl>
          </Grid>
         
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label='Numero de revision'
              type='number'
              value={state.revision}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'revision',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Typography
            variant='h6'
            color='blue'
            textAlign='center'>
            Resultado titulo
            </Typography>
          </Grid>
          <div>{state.fecha.split('-').join('')}-{state.comentario ? state.comentario : state.formato}-{state.edificio}-{state.sistema}-{state.empresa}-REV{state.revision}</div>



          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='body1'>Nombres de famias Revit</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Nombre'
            value={state.comentario}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'comentario',
                value: event.target.value
              });
            }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='disciplinaId' >Disciplina</InputLabel>
            <Select
              labelId='disciplinaId'
              id='disciplinaId'
              value={state.disciplina}
              label='Disciplina'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'disciplina',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'ARQ'}>Arquitectura</MenuItem>
                <MenuItem value={'ELEC'}>Electrico</MenuItem>
                <MenuItem value={'MEC'}>Mecanico</MenuItem>
                <MenuItem value={'STR'}>Estructural</MenuItem>
                <MenuItem value={'CVL'}>Civil</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
          <TextField
              fullWidth
              label='Tipo'
              value={state.tipo}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'tipo',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label='Numero de version'
              type='number'
              value={state.revision}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'revision',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Typography
            variant='h6'
            color='blue'
            textAlign='center'>
            Resultado titulo
            </Typography>
          </Grid>
          <div>{state.comentario}-{state.disciplina}-{state.tipo}-VER{state.revision}</div>

          
          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='body1'>Nombres de vistas de proyectos</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='vistaId' >Tipo de vista</InputLabel>
            <Select
              labelId='vistaId'
              id='vistaId'
              value={state.tipo}
              label='Unidad'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'tipo',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'PLAN'}>PLANTA</MenuItem>
                <MenuItem value={'SECTION'}>CORTE</MenuItem>
                <MenuItem value={'DETAIL'}>DETALLE</MenuItem>
                <MenuItem value={'ELEVATION'}>ELEVACION</MenuItem>
                <MenuItem value={'DIAGRAM'}>DIAGRAMA</MenuItem>
                <MenuItem value={'GENERAL'}>GENERAL</MenuItem>
                <MenuItem value={'INFORMATION'}>INFORMACION</MenuItem>
                <MenuItem value={'MODELING'}>MODELADO</MenuItem>
                <MenuItem value={'REVISION'}>REVISION</MenuItem>
                <MenuItem value={'SUPERVISION'}>SUPERVISION</MenuItem>
                <MenuItem value={'NWC'}>NAVISWORKS</MenuItem>
                <MenuItem value={'VPLAN'}>VPLAN</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='sistemaId' >Sistema</InputLabel>
            <Select
              labelId='sistemaId'
              id='edificioId'
              value={state.sistema}
              label='Sistema'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'sistema',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'VIDEO SURVEILLANCE SYSTEM'}>VIDEO SURVEILLANCE SYSTEM</MenuItem>
                <MenuItem value={'ACCESS CONTROL SYSTEM'}>ACCESS CONTROL SYSTEM</MenuItem>
                <MenuItem value={'FIRE ALARM SYSTEM'}>FIRE ALARM SYSTEM</MenuItem>
                <MenuItem value={'GENERAL'}>GENERAL</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Titulo o Area'
            value={state.titulo}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'titulo',
                value: event.target.value
              });
            }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label='NIVEL'
              type='number'
              value={state.nivel}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'nivel',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='unidadId' >Unidad</InputLabel>
            <Select
              labelId='unidadId'
              id='unidadId'
              value={state.unidad}
              label='Unidad'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'unidad',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'MTS'}>Metros</MenuItem>
                <MenuItem value={'FT'}>Pies</MenuItem>
                <MenuItem value={'INCHES'}>Inches</MenuItem>
            </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <Typography
            variant='h6'
            color='blue'
            textAlign='center'>
            Resultado titulo
            </Typography>
          </Grid>
          <div>{state.tipo ? `${state.tipo}-`: ''}{state.sistema ? `${state.sistema}-` : ''}{state.titulo ? `${state.titulo}-` : ''}{state.nivel ? `LEVEL ${state.nivel}` : ''}{state.unidad ? `${state.unidad}` : ''}</div>

          <Grid item xs={12}>
            <Box display='flex' justifyContent='center'>
              <Typography variant='body1'>Nombres de vistas 360</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label='Numero de vista'
              type='number'
              value={state.numeroPlano}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'numeroPlano',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
            <InputLabel id='tipoVistaId' >Tipó de vista</InputLabel>
            <Select
              labelId='tipoVistaId'
              id='tipoVistaId'
              value={state.tipo}
              label='Tipo de vista'
              onChange={(event: SelectChangeEvent<string>) => {
                dispatch({
                  type: 'input',
                  name: 'tipo',
                  value: event.target.value
                });
              }}>
                <MenuItem value={'INT'}>Interior</MenuItem>
                <MenuItem value={'EXT'}>Exterior</MenuItem>
                <MenuItem value={'AER'}>Aereo</MenuItem>
            </Select>
            </FormControl>
          </Grid>
           <Grid item xs={12} sm={4}>
            <TextField
            fullWidth
            label='Ubicación'
            value={state.titulo}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              dispatch({
                type: 'input',
                name: 'titulo',
                value: event.target.value
              });
            }} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label=''
              value={state.fecha}
              type='date'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'fecha',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12} sm={2}>
            <TextField
              fullWidth
              label='Numero de version'
              type='number'
              value={state.revision}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                dispatch({
                  type: 'input',
                  name: 'revision',
                  value: event.target.value
                });
              }} />
          </Grid>
          <Grid item xs={12}>
            <Typography
            variant='h6'
            color='blue'
            textAlign='center'>
            Resultado titulo
            </Typography>
          </Grid>
          <div>{state.numeroPlano}-{state.tipo}-({state.titulo})-{state.fecha.split('-').join('.')}-VER-{state.revision}</div>
      </Grid>
    </>
  );
};

export default GeneradorTitulos;
