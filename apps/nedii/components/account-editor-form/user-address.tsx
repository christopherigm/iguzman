import {
  ReactElement,
  useEffect,
  useState,
  FormEvent,
  useReducer,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import AddIcon from '@mui/icons-material/Add';
import { UserAddressInterface } from 'interfaces/user-interface';
import TextField from '@mui/material/TextField';
import Container from '@mui/material/Container';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Link from 'next/link';
import {
  API,
  GetCookieCachedValues,
  GetEnvVariables,
  GetLocalStorageData,
  APICreationErrorHandler,
} from 'utils';
import type {
  EnvironmentVariables,
  CachedValues,
  Languages,
  APIPostCreationError,
  Action,
} from 'utils';
import HomeIcon from '@mui/icons-material/Home';
import ApartmentIcon from '@mui/icons-material/Apartment';
import WorkIcon from '@mui/icons-material/Work';
import MarkunreadMailboxIcon from '@mui/icons-material/MarkunreadMailbox';

interface ItemProps {
  selected?: boolean;
  darkMode: boolean;
  label: string;
  icon: any;
  onClick: (A: string) => void
};

const Item = ({
    selected=false,
    darkMode,
    label,
    icon,
    onClick,
  }: ItemProps): ReactElement => {
  const [elevation, setElevation] = useState<number>(selected ? 3 : 1);

  useEffect(() => setElevation(_p => selected ? 3 : 1), [selected]);

  return (
    <Grid item xs={4} sm={3}>
      <Paper
        elevation={elevation}
        onClick={() => onClick(label)}
        onMouseLeave={() => setElevation(_p => selected ? 3 : 1)}
        onMouseOver={() => setElevation(_p => 4)}
        sx={{
          cursor: 'pointer'
        }}>
        <Box padding={1.5}>
          <Box
            display='flex'
            justifyContent='space-evenly'
            color={selected ? '#2196f3' : '#777'}>
            {icon}
          </Box>
          <Box
            marginTop={1}>
            <Divider />
          </Box>
          <Typography
            variant='body1'
            textAlign='center'
            color={darkMode ? 'primary.contrastText' : selected ? '#2196f3' : '#777'}
            paddingTop={1}
            noWrap={true}>
            {label}
          </Typography>
        </Box>
      </Paper>
    </Grid>
  )
};

type State = {
  isLoading: boolean;
  id?: number;
  alias: string;
  receptor_name: string;
  phone: string;
  zip_code: string;
  street: string;
  ext_number: string;
  int_number: string;
  reference: string;
  address_type:  'house' | 'apartment' | 'work' | 'mail_box';
  delivery_instructions: string;
  error: Array<APIPostCreationError>;
};

const InitialState: State = {
  isLoading: false,
  alias: '',
  receptor_name: '',
  phone: '',
  zip_code: '',
  street: '',
  ext_number: '',
  int_number: '',
  reference: '',
  address_type: 'house',
  delivery_instructions: '',
  error: []
};

const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'setState') {
    return {
      ...state,
      ...action.state,
    };
  } else if (action.type === 'clearState') {
    delete state.id;
    return {
      ...state,
      ...InitialState,
    };
  } else if (action.type === 'loading') {
    return {
      ...state,
      isLoading: true,
      error: [],
    };
  } else if (action.type === 'success') {
    return {
      ...state,
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
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};

interface Props {
  darkMode: boolean;
  userID: number;
  URLBase: string;
  jwt: string;
};

const UserAddress = ({
  darkMode,
  userID,
  URLBase,
  jwt,
}: Props): ReactElement => {
  const [state, dispatch] = useReducer(Reducer, InitialState);
  const [userAddress, setUserAddress] = useState<Array<UserAddressInterface>>([]);
  const [addAddress, setAddAddress] = useState<boolean>(false);
  const [addressTypes, setAddressTypes] = useState([
    {
      slug: 'house',
      label: 'Casa',
      icon: <HomeIcon />,
      selected: true,
    },
    {
      slug: 'apartment',
      label: 'Departamento',
      icon: <ApartmentIcon />,
      selected: false,
    },
    {
      slug: 'work',
      label: 'Trabajo',
      icon: <WorkIcon />,
      selected: false,
    },
    {
      slug: 'mail_box',
      label: 'Buzon',
      icon: <MarkunreadMailboxIcon />,
      selected: false,
    },
  ]);

  useEffect(() => {
    API.GetUserAddress({
      URLBase,
      jwt,
    })
      .then((address: Array<UserAddressInterface>) => {
        if (address && address.length) {
          setUserAddress(_p => address);
        }
      })
      .catch((error) => {
        console.log('error', error);
      })
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({type: 'loading'});
    const data = {
      URLBase,
      jwt,
      attributes: state,
      relationships: {
        user: {
          data: {
            type: 'User',
            id: userID
          }
        }
      }
    };
    if (state.id) {
      API.UpdateUserAddress({
          ...data,
          id: state.id,
        })
          .then(() => API.GetUserAddress({
            URLBase,
            jwt,
          }))
          .then((address: Array<UserAddressInterface>) => {
            setUserAddress(_p => address);
            setAddAddress(_p => false);
            dispatch({type: 'success'});
          })
          .catch((error) => {
            dispatch({
              type: 'error',
              error: error
            });
          });
    } else {
      API.CreateUserAddress(data)
        .then(() => API.GetUserAddress({
          URLBase,
          jwt,
        }))
        .then((address: Array<UserAddressInterface>) => {
          setUserAddress(_p => address);
          setAddAddress(_p => false);
          dispatch({type: 'success'});
        })
        .catch((error) => {
          dispatch({
            type: 'error',
            error: error
          });
        });
    }
  };

  const deleteUserAddress = () => {
    dispatch({type: 'loading'});
    API.DeleteUserAddress({
        URLBase,
        jwt,
        id: state.id || 0,
      })
        .then(() => API.GetUserAddress({
          URLBase,
          jwt,
        }))
        .then((address: Array<UserAddressInterface>) => {
          setUserAddress(_p => address);
          setAddAddress(_p => false);
          dispatch({type: 'success'});
        })
        .catch((error) => {
          dispatch({
            type: 'error',
            error: error
          });
        });
  };

  const canSubmit = (): boolean => {
    return true;
  };

  const setAddressTypesIcon = (slug: string) => {
    const m = [...addressTypes];
    m.map((i: any) => {
      if (slug === i.slug) {
        i.selected=true;
      } else {
        i.selected=false;
      }
    });
    setAddressTypes(_p => m);
  };

  return (
    <Grid
      container
      marginTop={0}
      marginBottom={2}
      columnSpacing={2}
      rowSpacing={2}>
      {
        addAddress ?
          <Grid item xs={12}>
            <Box marginBottom={1}>
              <Divider />
            </Box>
            <Typography variant='caption'>
              Crear nueva direccion
            </Typography>
            <Box
              component='form'
              noValidate={false}
              autoComplete='on'
              onSubmit={handleSubmit}>
            <Grid
              container
              marginTop={0}
              columnSpacing={2}
              rowSpacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label='Nombre de la direccion'
                  variant='outlined'
                  size='small'
                  type='text'
                  value={state.alias}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch({
                      type: 'input',
                      name: 'alias',
                      value: e.target.value
                    });
                  }}
                  disabled={state.isLoading}
                  style={{width: '100%'}}/>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label='Nombre del receptor'
                  variant='outlined'
                  size='small'
                  type='text'
                  value={state.receptor_name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch({
                      type: 'input',
                      name: 'receptor_name',
                      value: e.target.value
                    });
                  }}
                  disabled={state.isLoading}
                  style={{width: '100%'}}/>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label='Telefono'
                  variant='outlined'
                  size='small'
                  type='tel'
                  value={state.phone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch({
                      type: 'input',
                      name: 'phone',
                      value: e.target.value
                    });
                  }}
                  disabled={state.isLoading}
                  style={{width: '100%'}}/>
              </Grid>
              <Grid item xs={12}></Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label='Nombre de la calle'
                  variant='outlined'
                  size='small'
                  type='tel'
                  value={state.street}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch({
                      type: 'input',
                      name: 'street',
                      value: e.target.value
                    });
                  }}
                  disabled={state.isLoading}
                  style={{width: '100%'}}/>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label='Numero exterior'
                  variant='outlined'
                  size='small'
                  type='tel'
                  value={state.ext_number}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch({
                      type: 'input',
                      name: 'ext_number',
                      value: e.target.value
                    });
                  }}
                  disabled={state.isLoading}
                  style={{width: '100%'}}/>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label='Numero interior'
                  variant='outlined'
                  size='small'
                  type='tel'
                  value={state.int_number}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch({
                      type: 'input',
                      name: 'int_number',
                      value: e.target.value
                    });
                  }}
                  disabled={state.isLoading}
                  style={{width: '100%'}}/>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label='Codigo postal'
                  variant='outlined'
                  size='small'
                  type='tel'
                  value={state.zip_code}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch({
                      type: 'input',
                      name: 'zip_code',
                      value: e.target.value
                    });
                  }}
                  disabled={state.isLoading}
                  style={{width: '100%'}}/>
              </Grid>
              <Grid item xs={12}></Grid>
              <Grid item xs={12}>
                <TextField
                  label='Referencias'
                  variant='outlined'
                  size='small'
                  type='tel'
                  value={state.reference}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch({
                      type: 'input',
                      name: 'reference',
                      value: e.target.value
                    });
                  }}
                  disabled={state.isLoading}
                  style={{width: '100%'}}/>
                </Grid>
              
              <Grid item xs={12}>
                <Typography variant='caption'>
                  Tipo de direccion
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Grid
                  container
                  columnSpacing={2}
                  rowSpacing={2}>
                  {
                    addressTypes.map(({
                      slug,
                      icon,
                      label,
                      selected
                    }) => {
                      return (
                        <Item
                          darkMode={darkMode}
                          label={label}
                          icon={icon}
                          selected={selected}
                          onClick={() => {
                            setAddressTypesIcon(slug);
                            dispatch({
                              type: 'input',
                              name: 'address_type',
                              value: slug,
                            });
                          }}
                          key={label} />
                      );
                    })
                  }
                </Grid>
              </Grid>
              <Grid item
                xs={12}
                marginTop={1}
                sx={{
                  display: 'flex',
                  justifyContent: 'right'
                }}>
                <Button
                  variant='contained'
                  size='small'
                  disabled={state.isLoading || !canSubmit()}
                  onClick={() => setAddAddress(_p => false)}
                  color='inherit'>
                  Cancelar
                </Button>
                {
                  state.id ?
                    <Button
                      variant='contained'
                      size='small'
                      disabled={state.isLoading || !canSubmit()}
                      onClick={deleteUserAddress}
                      color='error'
                      sx={{
                        marginLeft: '20px'
                      }}>
                      Eliminar
                    </Button> : null
                }
                <Button
                  variant='contained'
                  type='submit'
                  size='small'
                  disabled={state.isLoading || !canSubmit()}
                  sx={{
                    marginLeft: '20px'
                  }}>
                  {
                    state.id ? 'Actualizar' : 'Agregar'
                  } direccion
                </Button>
              </Grid>

            </Grid>
            </Box>
          </Grid> :
          <>
            <Item
              darkMode={darkMode}
              icon={<AddIcon />}
              label='Agregar direccion'
              selected={false}
              onClick={() => {
                setAddressTypesIcon('house');
                dispatch({type: 'clearState'});
                setAddAddress(_p => true);
              }} />
            {
              userAddress.map((i: UserAddressInterface) => {
                return(
                  <Item
                    darkMode={darkMode}
                    icon={
                      i.attributes.address_type === 'house' ? <HomeIcon /> :
                      i.attributes.address_type === 'apartment' ? <ApartmentIcon /> :
                      i.attributes.address_type === 'work' ? <WorkIcon /> : <MarkunreadMailboxIcon />
                    }
                    label={i.attributes.alias}
                    selected={false}
                    onClick={() => {
                      setAddAddress(_p => true);
                      dispatch({
                        type: 'setState',
                        state: {
                          id: i.id,
                          alias: i.attributes.alias,
                          receptor_name: i.attributes.receptor_name,
                          phone: i.attributes.phone,
                          zip_code: i.attributes.zip_code,
                          street: i.attributes.street,
                          ext_number: i.attributes.ext_number,
                          int_number: i.attributes.int_number,
                          reference: i.attributes.reference,
                          address_type: i.attributes.address_type,
                          delivery_instructions: i.attributes.delivery_instructions,
                        }
                      });
                      setAddressTypesIcon(i.attributes.address_type);
                    }}
                    key={i.id} />
                );
              })
            }
          </>
      }
    </Grid>
  );
};

export default UserAddress;
