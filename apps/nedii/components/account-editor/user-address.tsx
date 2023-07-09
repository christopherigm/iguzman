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
import UserAddressForm from 'components/user-address-form';
import {
  MenuItemWithIcon
} from 'ui';

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
  URLBase: string;
  userID: number;
  jwt: string;
};

const UserAddress = ({
  darkMode,
  URLBase,
  userID,
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
            <UserAddressForm
              darkMode={darkMode}
              state={state}
              dispatch={dispatch}
              setAddressTypesIcon={setAddressTypesIcon}
              addressTypes={addressTypes}
              setAddAddress={setAddAddress}
              deleteUserAddress={deleteUserAddress}
              handleSubmit={handleSubmit} />
          </Grid> :
          <>
            <Grid item xs={4} sm={3}>
              <MenuItemWithIcon
                darkMode={darkMode}
                icon={<AddIcon />}
                label='Agregar direccion'
                selected={false}
                onClick={() => {
                  setAddressTypesIcon('house');
                  dispatch({type: 'clearState'});
                  setAddAddress(_p => true);
                }} />
              </Grid>
            {
              userAddress.map((i: UserAddressInterface) => {
                return(
                  <Grid item xs={4} sm={3} key={i.id}>
                    <MenuItemWithIcon
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
                      }} />
                    </Grid>
                );
              })
            }
          </>
      }
    </Grid>
  );
};

export default UserAddress;
