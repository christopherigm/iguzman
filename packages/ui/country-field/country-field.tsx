import {
  ReactElement,
  SyntheticEvent,
  useEffect,
  useState,
} from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import {
  API,
  CountryInterface,
} from 'utils';

type Props = {
  URLBase: string;
  language: 'en' | 'es',
  country: number;
  onChange: (name: string, value: number) => void;
};

type Option = {
  id: number;
  label: string;
};

const CountryField = ({
  URLBase,
  language = 'en',
  country = 0,
  onChange,
}: Props): ReactElement => {
  const [countries, setCountries] = useState<Array<CountryInterface>>([]);
  const [options, setOptions] = useState<Array<Option>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    setIsLoading(true);
    API.GetCountries({URLBase})
      .then((data: Array<CountryInterface>) => {
        setIsLoading(false);
        setCountries(data);
        setOptions(data.map((i: CountryInterface) => {
          return {
            id: i.id,
            label: i.attributes.name,
          };
        }));
        if (!country && data.length) {
          onChange('country', data[0].id);
        }
      })
      .catch((_e: any) => setIsLoading(false));
  }, []);

  return (
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
          options.filter((i: Option) => i.id === country).length ?
          options.filter((i: Option) => i.id === country)[0] :
          {
            id: 0,
            label: ''
          }
        }
        onChange={(_e: SyntheticEvent<Element, Event>, v: Option | null) => {
          if (v) {
            onChange('country', v.id);
            onChange('state', 0);
            onChange('city', 0);
          }
        }}
        renderInput={(params) =>
          <TextField {...params}
            label={
              !countries.length && isLoading?
              language === 'en' ? 'Loading countries' : 'Cargando paises' :
              language === 'en' ? 'County' : 'Pais'
            } />
        }
      />
    </Box>
  );
};
  
export default CountryField;
  