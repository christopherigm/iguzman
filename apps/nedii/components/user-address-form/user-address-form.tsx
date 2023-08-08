import {
  ReactElement,
  FormEvent,
  Dispatch,
  SetStateAction,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import {
  MenuItemWithIcon
} from 'ui';

type Props = {
  darkMode: boolean;
  state: any;
  dispatch: any;
  deleteUserAddress: () => void;
  setAddAddress: Dispatch<SetStateAction<boolean>>;
  addressTypes: Array<{
    slug: string;
    label: string;
    icon: any;
    selected: boolean;
  }>;
  setAddressTypesIcon: (A: string) => void;
  handleSubmit: (e: FormEvent) => void;
};

const UserAddressForm = ({
    darkMode=false,
    state,
    dispatch,
    deleteUserAddress,
    setAddAddress,
    addressTypes,
    setAddressTypesIcon,
    handleSubmit,
  }: Props): ReactElement => {

  const canSubmit = (): boolean => {
    return true;
  };

  return (
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
        <Grid item xs={12} sm={6}>
          <TextField
            label='Nombre de la calle'
            variant='outlined'
            size='small'
            type='text'
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
            type='text'
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
            type='text'
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
            type='text'
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
                  <Grid item xs={4} sm={3} key={label}>
                    <MenuItemWithIcon
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
                      }} />
                  </Grid>
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
            onClick={() => setAddAddress((_p: boolean) => false)}
            color='inherit'
            sx={{textTransform: 'initial',}}>
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
                  marginLeft: '15px',
                  textTransform: 'initial',
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
              marginLeft: '15px',
              textTransform: 'initial',
            }}>
            {
              state.id ? 'Actualizar' : 'Agregar'
            } direccion
          </Button>
        </Grid>

      </Grid>
    </Box>
  );
};

export default UserAddressForm;
