import { ReactElement, useCallback, useEffect, useState } from 'react';
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
import { State } from '@repo/utils';

const state = signal<State>(State.getInstance()).value;

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

const StateField = ({
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
  state.URLBase = URLBase;

  const loadItems = (value: number): Promise<void> => {
    return new Promise((res, rej) => {
      setIsLoading(true);
      state
        .GetStatesByCountryID(Number(dependentID))
        .then((response: { data: Array<State> }) => {
          const newOptions = response.data.map((i: State) => {
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
          res();
        })
        .catch((e: any) => rej(e))
        .finally(() => setIsLoading(false));
    });
  };

  useEffect(() => {
    state.relationships.country.data.id = Number(dependentID);
    if (
      ((!options.length && dependentID) ||
        Number(dependentID) !== previousID) &&
      !isLoading
    ) {
      setNewEntry(false);
      setPreviousID(Number(dependentID));
      loadItems(value);
    }
  }, [dependentID, value, state.id, previousID, options.length]);

  const CreateState = () => {
    setIsLoading(true);
    state
      .save()
      .then(() => {
        state.attributes.name = '';
        onChange(state.id);
      })
      .then(() => loadItems(state.id))
      .then(() => setNewEntry(false))
      .catch((e: any) => console.log(e));
  };

  const getLabel = (): string => {
    return !options.length && isLoading
      ? language === 'en'
        ? 'Loading states'
        : 'Cargando estados'
      : language === 'en'
        ? 'State'
        : 'Estado';
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
              label={language === 'en' ? 'New state' : 'Nuevo estado'}
              variant="outlined"
              size="small"
              type="text"
              value={state.attributes.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                (state.attributes.name = e.target.value)
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
              onSubmit={CreateState}
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
                disabled={isLoading || state.attributes.name.length < 3}
                sx={{
                  marginLeft: '15px',
                  textTransform: 'initial',
                }}
                onClick={CreateState}
                onSubmit={CreateState}
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
                  onChange(Number(e.target.value))
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
              size="small"
              disabled={isLoading}
              sx={{
                marginLeft: '20px',
                textTransform: 'initial',
              }}
              onClick={() => {
                setNewEntry(true);
                state.id = 0;
                state.attributes.name = '';
                onChange(state.id);
              }}
            >
              Nuevo
            </Button>
          </Box>
          {!newEntry ? (
            <Typography variant="caption">
              {language === 'en' ? (
                <>
                  If the state where you live in, isn't listed, click on{' '}
                  <b>New</b> to add add a new state.
                </>
              ) : (
                <>
                  Si tu estado no se encuentra listado, da click en
                  <b> Nuevo</b> para agregar un nuevo estado.
                </>
              )}
            </Typography>
          ) : null}
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

export default StateField;
