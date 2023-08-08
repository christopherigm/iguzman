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
  CityInterface,
} from 'utils';

type Props = {
  URLBase: string;
  language: 'en' | 'es',
  state: number;
  city: number;
  onChange: (value: number) => void;
};

type Option = {
  id: number;
  label: string;
};

const CityField = ({
  URLBase,
  language = 'en',
  state,
  city,
  onChange,
}: Props): ReactElement => {
  const [cities, setCities] = useState<Array<CityInterface>>([]);
  const [options, setOptions] = useState<Array<Option>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [newEntry, setNewEntry] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');

  useEffect(() => {
    setIsLoading(true);
    GetCities();
  }, [state]);

  const GetCities = (): Promise<CityInterface> => {
    return new Promise((_res, rej) =>{
      API.GetCitiesByStateID({
        URLBase,
        stateID: state
      })
        .then((data: Array<CityInterface>) => {
          setIsLoading(false);
          setNewEntry(false);
          setCities(data);
          setOptions(data.map((i: CityInterface) => {
            return {
              id: i.id,
              label: i.attributes.name,
            };
          }));
          if (!city && data.length) {
            onChange(data[0].id);
          }
        })
        .catch((e: any) => rej(e));
    });
  };

  const CreateCity = () => {
    setIsLoading(true);
    API.CreateCity({
      URLBase,
      name: newName,
      state,
    })
    .then((d: CityInterface) => onChange(d.id))
      .then(() => API.GetCitiesByStateID({
        URLBase,
        stateID: state,
      }))
      .then(GetCities)
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
            'New city' :
            'Nueva ciudad'
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
          onSubmit={CreateCity}>
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
            onClick={CreateCity}
            onSubmit={CreateCity}>
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
              options.length &&
              options.filter((i: Option) => i.id === city).length ?
              options.filter((i: Option) => i.id === city)[0] : {
                id: 0,
                label: ''
              }
            }
            onChange={(_e: SyntheticEvent<Element, Event>, v: Option | null) => {
              if (v) {
                onChange(v.id);
              }
            }}
            renderInput={(params) =>
              <TextField {...params}
                label={
                  !cities.length && isLoading?
                  language === 'en' ? 'Loading cities' : 'Cargando ciudades' :
                  language === 'en' ? 'City' : 'Ciudad'
                } />
            }
          />
          <Button
            variant='contained'
            type='submit'
            size='small'
            disabled={false}
            sx={{
              marginLeft: '20px',
              textTransform: 'initial',
            }}
            onClick={() => {
              setNewEntry(true);
              setNewName('');
            }}>
            Nueva
          </Button>
        </Box>
        <Typography variant='caption'>
          Si tu ciudad no se encuentra listada, de click en <b>Nueva</b> para agregar una nueva ciudad.
        </Typography>
      </Box>
    }
    </>
  );
};
  
export default CityField;
  