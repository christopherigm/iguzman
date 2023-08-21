import {
  ReactElement,
  SyntheticEvent,
  useEffect,
  useState,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import {
  API,
  StateInterface
} from 'utils';

type Props = {
  URLBase: string;
  language: 'en' | 'es';
  country: number;
  state: number;
  onChange: (name: string, value: number) => void;
};

type Option = {
  id: number;
  label: string;
};

const StateField = ({
  URLBase,
  language = 'en',
  country,
  state,
  onChange,
}: Props): ReactElement => {
  const [states, setStates] = useState<Array<StateInterface>>([]);
  const [options, setOptions] = useState<Array<Option>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [newEntry, setNewEntry] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');

  useEffect(() => {
    setIsLoading(true);
    GetStates();
  }, [country]);

  const GetStates = (): Promise<StateInterface> => {
    return new Promise((_res, rej) =>{
      API.GetStatesByCountryID({
        URLBase,
        countryID: country,
      })
        .then((data: Array<StateInterface>) => {
          setIsLoading(false);
          setNewEntry(false);
          setStates(data);
          setOptions(data.map((i: StateInterface) => {
            return {
              id: i.id,
              label: i.attributes.name,
            };
          }));
          if (!state && data.length) {
            onChange('state', data[0].id);
          }
        })
        .catch((e: any) => rej(e));
    });
  };

  const CreateState = () => {
    setIsLoading(true);
    API.CreateState({
      URLBase,
      name: newName,
      country,
    })
      .then((data: StateInterface) => onChange('state', data.id))
      .then(() => API.GetStatesByCountryID({
        URLBase,
        countryID: country,
      }))
      .then(GetStates)
      .catch((_e: any) => setIsLoading(false));
  };

  return (
    <>
    {
      newEntry ?
      <>
      <Box
        display='flex'
        flexDirection='column'>
        <TextField
          label={
            language === 'en' ?
            'New state' :
            'Nuevo estado'
          }
          variant='outlined'
          size='small'
          type='text'
          value={newName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setNewName(e.target.value)
          }
          disabled={isLoading}
          sx={{width: '100%'}} />
        <Box
          display='flex'
          flexDirection='row'
          justifyContent='end'
          alignItems='center'
          marginTop={1}
          marginBottom={1}
          onSubmit={CreateState}>
          <Button
            variant='contained'
            type='submit'
            size='small'
            color='inherit'
            disabled={isLoading}
            sx={{
              marginLeft: '15px',
              textTransform: 'initial',
            }}
            onClick={() => setNewEntry(false)}>
            {language === 'en' ? 'Cancel' : 'Cancelar'}
          </Button>
          <Button
            variant='contained'
            type='submit'
            size='small'
            color='success'
            disabled={isLoading || newName.length < 3}
            sx={{
              marginLeft: '15px',
              textTransform: 'initial',
            }}
            onClick={CreateState}
            onSubmit={CreateState}>
            {language === 'en' ? 'Save' : 'Guardar'}
          </Button>
        </Box>
      </Box>
      </> :
      <Box
        display='flex'
        flexDirection='column'>
        <Box
          display='flex'
          flexDirection='row'
          justifyContent='space-between'
          alignItems='center'
          marginBottom={1}>
          <Autocomplete
            disablePortal={true}
            options={options}
            size='small'
            sx={{width: '100%'}}
            disableClearable={true}
            disabled={isLoading}
            value={
              state && options.length &&
              options.filter((i: Option) => i.id === state).length ?
              options.filter((i: Option) => i.id === state)[0] : {
                id: 0,
                label: ''
              }
            }
            onChange={(_e: SyntheticEvent<Element, Event>, v: Option | null) => {
              if (v) {
                onChange('state', v.id);
                onChange('city', 0);
              }
            }}
            renderInput={(params) =>
              <TextField {...params}
                label={
                  !states.length && isLoading?
                  language === 'en' ? 'Loading states' : 'Cargando estados' :
                  language === 'en' ? 'State' : 'Estado'
                } />
            }
          />
          <Button
            variant='contained'
            type='submit'
            size='small'
            disabled={isLoading}
            sx={{
              marginLeft: '20px',
              textTransform: 'initial',
            }}
            onClick={() => {
              setNewEntry(true);
              setNewName('');
            }}>
            Nuevo
          </Button>
        </Box>
        {
          !newEntry ?
            <Typography variant='caption'>
              Si tu estado no se encuentra listada, de click en <b>Nuevo</b> para agregar una nuevo estado.
            </Typography> : null
        }
      </Box>
    }
    </>
  );
};
  
export default StateField;
  