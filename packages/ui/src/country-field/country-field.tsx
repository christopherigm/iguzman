import { ReactElement, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { API, Country } from '@repo/utils';

type Props = {
  URLBase: string;
  language: 'en' | 'es';
  country: number;
  defaultCountryID?: number;
  onChange: (value: number) => void;
};

type Option = {
  id: number;
  label: string;
};

const CountryField = ({
  URLBase,
  language = 'en',
  country = 0,
  defaultCountryID,
  onChange,
}: Props): ReactElement => {
  const [countries, setCountries] = useState<Array<Country>>([]);
  const [options, setOptions] = useState<Array<Option>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    setIsLoading(true);
    API.GetCountries({ URLBase })
      .then((data: Array<Country>) => {
        setIsLoading(false);
        setCountries(data);
        setOptions(
          data.map((i: Country) => {
            return {
              id: i.id,
              label: i.attributes.name,
            };
          })
        );
        if (!country && data.length && data[0] && !defaultCountryID) {
          onChange(data[0].id);
        } else if (defaultCountryID) {
          onChange(defaultCountryID);
        }
      })
      .catch((_e: any) => setIsLoading(false));
  }, [defaultCountryID]);

  const getLabel = (): string => {
    return !countries.length && isLoading
      ? language === 'en'
        ? 'Loading countries'
        : 'Cargando paises'
      : language === 'en'
        ? 'County'
        : 'Pais';
  };

  return (
    <Box
      display="flex"
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      marginBottom={1}
    >
      <FormControl fullWidth>
        <InputLabel id="demo-simple-select-label">{getLabel()}</InputLabel>
        <Select
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value={String(country)}
          label={getLabel()}
          disabled={isLoading || !options.length}
          size="small"
          onChange={(e: SelectChangeEvent) => onChange(Number(e.target.value))}
        >
          {options.map((i: Option, index: number) => {
            return (
              <MenuItem key={index} value={i.id}>
                {i.label}
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>
    </Box>
  );
};

export default CountryField;
