import { ReactElement, useEffect, useState } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import LinearProgress from '@mui/material/LinearProgress';
import { City } from '@repo/utils';

const city = signal<City>(City.getInstance()).value;

type Props = {
  URLBase: string;
  language: 'en' | 'es';
  dependentID: number;
  value: number;
  onChange: (value: number) => void;
};

type Option = {
  id: number;
  label: string;
};

const valueIsInOptions: Signal<boolean> = signal(false);

const CityField = ({
  URLBase,
  language = 'en',
  dependentID,
  value,
  onChange,
}: Props): ReactElement => {
  const [options, setOptions] = useState<Array<Option>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [newEntry, setNewEntry] = useState<boolean>(false);
  const [previousID, setPreviousID] = useState<number>(0);
  valueIsInOptions.value = options.map((i) => i.id).indexOf(value) >= 0;
  city.URLBase = URLBase;

  useEffect(() => {
    city.relationships.state.data.id = Number(dependentID);
    if (
      ((!options.length && dependentID) ||
        Number(dependentID) !== previousID) &&
      !isLoading
    ) {
      setIsLoading(true);
      setPreviousID(Number(dependentID));
      city
        .GetCitiesByStateID(Number(dependentID))
        .then((response: { data: Array<City> }) => {
          const newOptions = response.data.map((i: City) => {
            return {
              id: Number(i.id),
              label: i.attributes.name,
            };
          });
          setOptions(newOptions);
          valueIsInOptions.value =
            newOptions.map((i) => i.id).indexOf(value) >= 0;
          // console.log('==================================');
          // console.log('Loading cities');
          // console.log('state:', dependentID);
          // console.log('previousID:', previousID);
          // console.log('city:', value);
          // console.log('options:', newOptions);
          // console.log('==================================');
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
  }, [dependentID, value, previousID, options.length]);

  const CreateCity = () => {
    setIsLoading(true);
    city
      .save()
      .then(() => {
        city.attributes.name = '';
        onChange(city.id);
        setPreviousID(0);
        setOptions([]);
      })
      .catch((e: any) => console.log(e))
      .finally(() => {
        setNewEntry(false);
        setIsLoading(false);
      });
  };

  const getLabel = (): string => {
    return !options.length && isLoading
      ? language === 'en'
        ? 'Loading cities'
        : 'Cargando ciudades'
      : language === 'en'
        ? 'City'
        : 'Ciudad';
  };

  if (isLoading || (isLoading && !valueIsInOptions.value)) {
    return (
      <Box sx={{ width: '100%' }} marginTop={2}>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <>
      {newEntry || !options.length ? (
        <>
          <Box display="flex" flexDirection="column">
            <TextField
              label={language === 'en' ? 'New city' : 'Nueva ciudad'}
              variant="outlined"
              size="small"
              type="text"
              value={city.attributes.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                (city.attributes.name = e.target.value)
              }
              disabled={isLoading}
              sx={{ width: '100%' }}
            />
            <Box
              display="flex"
              flexDirection="row"
              justifyContent="end"
              alignItems="center"
              marginTop={1}
              marginBottom={1}
              onSubmit={CreateCity}
            >
              <Button
                variant="contained"
                type="submit"
                size="small"
                color="inherit"
                disabled={isLoading}
                sx={{
                  marginLeft: '15px',
                  textTransform: 'initial',
                }}
                onClick={() => setNewEntry(false)}
              >
                {language === 'en' ? 'Cancel' : 'Cancelar'}
              </Button>
              <Button
                variant="contained"
                type="submit"
                size="small"
                color="success"
                disabled={isLoading || city.attributes.name.length < 3}
                sx={{
                  marginLeft: '15px',
                  textTransform: 'initial',
                }}
                onClick={CreateCity}
                onSubmit={CreateCity}
              >
                {language === 'en' ? 'Save' : 'Guardar'}
              </Button>
            </Box>
            {isLoading ? (
              <Box sx={{ width: '100%' }} marginTop={2}>
                <LinearProgress />
              </Box>
            ) : null}
          </Box>
        </>
      ) : (
        <Box display="flex" flexDirection="column">
          <Box
            display="flex"
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            marginBottom={1}
          >
            <FormControl fullWidth>
              <InputLabel id="demo-simple-select-label">
                {getLabel()}
              </InputLabel>
              <Select
                labelId="demo-simple-select-label"
                id="demo-simple-select"
                value={String(value)}
                label={getLabel()}
                disabled={isLoading || !options.length}
                size="small"
                onChange={(e: SelectChangeEvent) =>
                  Number(e.target.value) && options.length
                    ? onChange(Number(e.target.value))
                    : null
                }
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
            <Button
              variant="contained"
              type="submit"
              disabled={false}
              sx={{
                marginLeft: '10px',
                textTransform: 'initial',
              }}
              onClick={() => {
                setNewEntry(true);
                city.id = 0;
                city.attributes.name = '';
              }}
            >
              Nueva
            </Button>
          </Box>
          <Typography variant="caption">
            {language === 'en' ? (
              <>
                If the city where you live in, isn't listed, click on <b>New</b>{' '}
                to add add a new city.
              </>
            ) : (
              <>
                Si tu ciuad no se encuentra listada, da click en <b>Nuevo</b>{' '}
                para agregar una nueva ciudad.
              </>
            )}
          </Typography>
          {isLoading ? (
            <Box sx={{ width: '100%' }} marginTop={2}>
              <LinearProgress />
            </Box>
          ) : null}
        </Box>
      )}
    </>
  );
};

export default CityField;
