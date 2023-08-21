import React, {
  ReactElement,
  useState,
  useReducer,
  useEffect,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import GroupItem from 'components/group-item';
import {
  PaperCard,
  GenericImageInput,
} from 'ui';
import type {
  ExpoInterface,
  GroupInterface,
} from 'interfaces/stand-interface';
import Button from '@mui/material/Button';
import { APICreationErrorHandler } from 'utils';
import type {
  APIPostCreationError,
  CreationErrorInput,
  Action,
} from 'utils';
import CreateExpoAPI from 'local-utils/create-expo';

type State = {
  isLoading: boolean;
  name: string;
  email: string;
  description: string;
  img_picture: string;
  is_real: boolean;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  isLoading: false,
  name: '',
  email: '',
  description: '',
  img_picture: '',
  is_real: false,
  error: []
};

const Reducer = (state: State = InitialState, action: Action<null, CreationErrorInput>): State => {
  if (action.type === 'loading') {
    return {
      ...state,
      isLoading: true,
      error: [],
    };
  } else if (action.type === 'success') {
    return {
      ...state,
      name: '',
      email: '',
      img_picture: '',
      is_real: false,
      error: [],
      isLoading: false,
    };
  } else if (action.type === 'error' && action.error) {
    return {
      ...state,
      error: APICreationErrorHandler(action.error),
      isLoading: false,
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      error: [],
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};

type Props = {
  URLBase: string;
  onSuccess: () => void;
  onCancel: () => void;
  groups: Array<GroupInterface>;
};

const CreateExpo = ({
    URLBase,
    onSuccess,
    onCancel,
    groups,
  }: Props): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [groupsSelected, setGroupsSelected] = useState<Array<number>>([]);

  useEffect(() => {}, [groupsSelected]);

  const HandleCreateExpo = () => {
    dispatch({type: 'loading'});
    CreateExpoAPI({
      URLBase,
      payload: {
        name: state.name,
        email: state.email,
        description: state.description,
        img_picture: state.img_picture,
        is_real: !state.is_real,
      },
      groupsSelected: groupsSelected,
    })
      .then((expo: ExpoInterface) => {
        console.log('expo', expo);
        dispatch({type: 'success'});
        onSuccess();
      })
      .catch((error) => 
        dispatch({
          type: 'error',
          error,
        })
      );
  };

  return (
    <PaperCard>
      <Box
        display='flex'
        flexDirection='row'
        justifyContent='space-between'
        alignItems='center'>
        <Typography variant='body1' fontWeight={600}>
          Agregar nueva expo
        </Typography>
        <Button
          variant='contained'
          size='small'
          onClick={() => {
            if (state.isLoading) {
              return;
            }
            onCancel();
          }}
          color='inherit'
          disabled={state.isLoading}>
          Cancelar
        </Button>
      </Box>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Grid
        container
        rowSpacing={3}
        columnSpacing={2}>
        <Grid item xs={12} sm={3}>
          <GenericImageInput
            label='Imagen para la expo'
            language='es'
            onChange={(img: string) => {
              dispatch({
                type: 'input',
                name: 'img_picture',
                value: img
              });
            }}
            isLoading={state.isLoading}
            height={260}
            width='100%'
            defaultValue={state.img_picture}
            labelPosition='bottom' />
        </Grid>
        <Grid item xs={12} sm={6}>
          <Grid
            container
            rowSpacing={3}>
            <Grid item xs={12} sm={7}>
              <TextField
                label='Nombre de la expo'
                variant='outlined'
                size='small'
                type='text'
                value={state.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  dispatch({
                    type: 'input',
                    name: 'name',
                    value: e.target.value
                  });
                }}
                disabled={state.isLoading}
                sx={{width: '100%'}} />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label='Correo de contacto'
                variant='outlined'
                size='small'
                type='text'
                value={state.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  dispatch({
                    type: 'input',
                    name: 'email',
                    value: e.target.value
                  });
                }}
                disabled={state.isLoading}
                style={{width: '100%'}}/>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label='Descripcion de la expo (opcional)'
                variant='outlined'
                size='small'
                type='text'
                multiline={true}
                rows={5}
                value={state.description}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  dispatch({
                    type: 'input',
                    name: 'description',
                    value: e.target.value
                  });
                }}
                disabled={state.isLoading}
                sx={{width: '100%'}} />
            </Grid>
            <Grid item xs={12}>
              <FormGroup>
                <FormControlLabel
                  disabled={state.isLoading}
                  control={
                    <Switch
                      checked={state.is_real}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        dispatch({
                          type: 'input',
                          name: 'is_real',
                          value: e.target.checked
                        });
                      }} />
                  }
                  label='Expo virtual?' />
              </FormGroup>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Box marginBottom={1}>
        <Typography variant='body1' fontWeight={600}>
          Categorias
        </Typography>
      </Box>
      <Box marginBottom={2}>
        <Typography variant='body1'>
          {
            state.name ?
            <>Selecciona una o mas categorias para la expo {`"${state.name}"`}.</> :
            <>Selecciona una o mas categorias para la nueva expo.</>
          }
          {' '}(Opcional)
        </Typography>
      </Box>
      <Grid
        container
        rowSpacing={2}
        columnSpacing={2}>
        {
          groups.map((i: GroupInterface, index: number) => {
            const itemIndex: number = groupsSelected.indexOf(Number(i.id));
            return (
              <Grid item xs={6} sm={4} md={3} key={index}>
                <GroupItem
                  onClick={() => {
                    if (state.isLoading) {
                      return;
                    }
                    const e: Array<number> = [...groupsSelected];
                    if (itemIndex > -1) {
                      e.splice(itemIndex, 1);
                    } else {
                      e.push(Number(i.id));
                    }
                    setGroupsSelected(_p => e);
                  }}
                  selected={itemIndex > -1}
                  group={i} />
              </Grid>
            );
          })
        }
      </Grid>
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      <Box
        display='flex'
        justifyContent='end'>
        <Button
          variant='contained'
          type='submit'
          size='small'
          color='inherit'
          disabled={state.isLoading}
          onClick={onCancel}
          sx={{marginRight: 2}}>
          Cancelar
        </Button>
        <Button
          variant='contained'
          type='submit'
          size='small'
          disabled={state.isLoading}
          onClick={HandleCreateExpo}>
          Guardar Expo
        </Button>
      </Box>
    </PaperCard>
  )
};

export default CreateExpo;
