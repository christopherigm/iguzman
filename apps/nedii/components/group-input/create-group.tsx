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
import {
  PaperCard,
  GenericImageInput,
  GenericImage,
  UIIcons,
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
import CreateGroupAPI from 'local-utils/create-group';
import AddGroupToExpoAPI from 'local-utils/add-group-to-expo';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DoDisturbOnIcon from '@mui/icons-material/DoDisturbOn';
import ExpoItem from 'components/expo-item';

type State = {
  isLoading: boolean;
  name: string;
  description: string;
  icon: string;
  color: string;
  img_picture: string;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  isLoading: false,
  name: '',
  description: '',
  icon: '',
  color: '#000',
  img_picture: '',
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
      icon: '',
      color: '',
      img_picture: '',
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
  expos: Array<ExpoInterface>;
  onSuccess: () => void;
  onCancel: () => void;
  onCreateExpo: () => void;
};

const CreateGroup = ({
    URLBase,
    expos,
    onSuccess,
    onCancel,
    onCreateExpo,
  }: Props): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [exposSelected, setExposSelected] = useState<Array<number>>([]);

  useEffect(() => {}, [exposSelected]);

  const HandleCreateGroup = () => {
    dispatch({type: 'loading'});
    const promises: Array<Promise<ExpoInterface>> = [];
    
    CreateGroupAPI({
      URLBase,
      payload: {
        name: state.name,
        icon: state.icon,
        color: state.color,
        description: state.description,
        img_picture: state.img_picture,
      }
    })
      .then((g: GroupInterface) => {
        exposSelected.forEach((i: number) => {
          promises.push(
            new Promise((res, rej) => {
              AddGroupToExpoAPI({
                URLBase,
                expoID: i,
                groupID: g.id,
              })
                .then((e: ExpoInterface) => res(e))
                .catch(error => rej(error));
            })
          );
        });
        Promise.all(promises)
        .then(() => {
          dispatch({type: 'success'});
          onSuccess();
        })
        .catch((error) => {
          dispatch({
            type: 'error',
            error,
          });
        });
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
          Agregar nueva categoria
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
            label='Imagen para la categoria'
            language={'es'}
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
                label='Nombre de la categoria'
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
            <Grid item xs={12} sm={7}>
              <TextField
                label='Color para la categoria'
                variant='outlined'
                size='small'
                type='color'
                value={state.color}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  dispatch({
                    type: 'input',
                    name: 'color',
                    value: e.target.value
                  });
                }}
                disabled={state.isLoading}
                sx={{width: '100%'}} />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label='Descripcion de la categoria (opcional)'
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
          </Grid>
        </Grid>
      </Grid>
      
      <Box marginTop={2} marginBottom={2}>
        <Divider />
      </Box>
      
      <Box marginBottom={1}>
        <Typography variant='body1' fontWeight={600}>
          Selecciona una o mas expos para esta categoria
        </Typography>
      </Box>

      <>
        <Box
          display='flex'
          flexDirection='row'
          justifyContent='space-between'
          alignItems='center'
          marginBottom={2}>
          <Box>
            <Typography variant='body2'>
              Puedes agregar esta categoria a una o mas expos (virtuales o fisicas).
              Siempre es posible editar estos cambios.
            </Typography>
          </Box>
          <Button
            variant='contained'
            type='submit'
            size='small'
            onClick={onCreateExpo}
            disabled={state.isLoading}>
            Crear expo
          </Button>
        </Box>
        <Box marginBottom={2}>
          <Divider />
        </Box>
        <Grid
          container
          rowSpacing={2}
          columnSpacing={2}>
          {
            expos.map((i: ExpoInterface, index: number) => {
              const itemIndex: number = exposSelected.indexOf(Number(i.id));
              return (
                <Grid item xs={6} sm={4} md={3} key={index}>
                  <ExpoItem
                    expo={i}
                    selected={itemIndex > -1}
                    onClick={() => {
                      console.log('>>>', exposSelected);
                      if (state.isLoading) {
                        return;
                      }
                      const e: Array<number> = [...exposSelected];
                      if (itemIndex > -1) {
                        e.splice(itemIndex, 1);
                      } else {
                        e.push(Number(i.id));
                      }
                      setExposSelected(_p => e);
                    }} />
                </Grid>
              );
            })
          }
        </Grid>
      </>

      <Box marginTop={2}>
        <Divider />
      </Box>

      <Box
        marginTop={3}
        marginBottom={2}>
        <Typography variant='body1' textAlign='left'>
          Selecciona un icono (Opcional)
        </Typography>
      </Box>
      <UIIcons
        onChange={(icon: string) => {
          dispatch({
            type: 'input',
            name: 'icon',
            value: icon
          });
        }}
        isLoading={state.isLoading}
        color={state.color} />
      <Box marginBottom={2}>
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
          onClick={HandleCreateGroup}>
          Guardar Categoria
        </Button>
      </Box>

    </PaperCard>
  )
};

export default CreateGroup;
