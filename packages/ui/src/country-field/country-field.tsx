import { ReactElement, useEffect, useState } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { API, Country } from '@repo/utils';

type Props = {
  URLBase: string;
  language: 'en' | 'es';
  value: number;
  onChange: (value: number) => void;
};

const valueIsInOptions: Signal<boolean> = signal(false);

type Option = {
  id: number;
  label: string;
};

const CountryField = ({
  URLBase,
  language = 'en',
  value = 0,
  onChange,
}: Props): ReactElement => {
  const [options, setOptions] = useState<Array<Option>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  valueIsInOptions.value = options.map((i) => i.id).indexOf(value) >= 0;

  useEffect(() => {
    if (!options.length && !isLoading) {
      setIsLoading(true);
      API.GetCountries({ URLBase })
        .then((response: { data: Array<Country> }) => {
          const newOptions = response.data.map((i: Country) => {
            return {
              id: Number(i.id),
              label: i.attributes.name,
            };
          });
          setOptions(newOptions);
          valueIsInOptions.value =
            newOptions.map((i) => i.id).indexOf(value) >= 0;
          if (!value && newOptions.length && newOptions[0]) {
            onChange(newOptions[0].id);
          } else if (
            !valueIsInOptions.value &&
            newOptions.length &&
            newOptions[0]
          ) {
            onChange(newOptions[0].id);
          }
        })
        .catch((e: any) => console.log(e))
        .finally(() => setIsLoading(false));
    }
  }, [value, options.length]);

  const getLabel = (): string => {
    return !options.length && isLoading
      ? language === 'en'
        ? 'Loading countries'
        : 'Cargando paises'
      : language === 'en'
        ? 'County'
        : 'Pais';
  };

  if (isLoading || !valueIsInOptions.value) {
    return (
      <Box sx={{ width: '100%' }} marginTop={2}>
        <LinearProgress />
      </Box>
    );
  }

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
          value={String(value)}
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
      {isLoading ? (
        <Box sx={{ width: '100%' }} marginTop={2}>
          <LinearProgress />
        </Box>
      ) : null}
    </Box>
  );
};

export default CountryField;
