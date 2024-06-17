import { ReactElement, useEffect, useState } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Avatar from '@mui/material/Avatar';
import { GenericFormButtons, GenericImageInput } from '@repo/ui';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { API } from '@repo/utils';
import { user } from 'classes/user';

import Schema, {
  productClassification as instance,
} from 'classes/product/product-classification';
import { system } from 'classes/system';

const Label = 'Clasificacion';

type Props = {
  standID: number;
  value: number;
  onChange: (id: number) => void;
};

type Option = {
  id: number;
  label: string;
  image: string;
};

const valueIsInOptions: Signal<boolean> = signal(false);

const ProductClassificationField = ({
  standID,
  value,
  onChange,
}: Props): ReactElement => {
  system.setDataFromLocalStorage();
  user.setDataFromLocalStorage();
  const [options, setOptions] = useState<Array<Option>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [newEntry, setNewEntry] = useState<boolean>(false);
  valueIsInOptions.value = options.map((i) => i.id).indexOf(value) >= 0;

  const getImage = (): string => {
    let image = '';
    options.map((i: Option) => {
      if (Number(i.id) === value) {
        image = i.image;
      }
    });
    return image;
  };

  const loadItems = (value: number): Promise<void> => {
    return new Promise((res, rej) => {
      setIsLoading(true);
      let url = `${system.URLBase}/${Schema.getInstance().endpoint}`;
      url += `?filter[stand]=${standID}`;
      url += '&page[size]=100';
      API.Get({
        url,
        jwt: user.access,
      })
        .then((response: { data: Array<Schema> }) => {
          const newOptions = response.data.map((i: Schema) => {
            return {
              id: Number(i.id),
              label: i.attributes.name,
              image: i.attributes.img_picture,
            };
          });
          setOptions(newOptions);
          valueIsInOptions.value =
            newOptions.map((i) => i.id).indexOf(value) >= 0;
          // console.log('==================================');
          // console.log('Loading classifications');
          // console.log('classification:', value);
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
          res();
        })
        .catch((e: any) => rej(e))
        .finally(() => setIsLoading(false));
    });
  };

  useEffect(() => {
    instance.URLBase = system.URLBase;
    instance.access = user.access;
    instance.attributes.name = '';
    instance.relationships.stand.data.id = standID;
    if (!options.length && !isLoading) {
      loadItems(value).catch((e: any) => console.log(e));
    }
  }, [value, instance.id, options.length]);

  const CreateNewOption = () => {
    setIsLoading(true);
    instance
      .save()
      .then(() => onChange(instance.id))
      .then(() => loadItems(instance.id))
      .then(() => setNewEntry(false))
      .catch((e: any) => console.log(e));
  };

  const getLabel = (): string => {
    return !options.length && isLoading ? 'Cargando opciones' : Label;
  };

  if (isLoading || (isLoading && !valueIsInOptions.value)) {
    return (
      <Grid item xs={12}>
        <Box sx={{ width: '100%' }} marginTop={2}>
          <LinearProgress />
        </Box>
      </Grid>
    );
  }

  return (
    <>
      {newEntry || !options.length ? (
        <Grid item xs={12}>
          <Box
            display="flex"
            flexDirection="column"
            border="1px solid #bbb"
            borderRadius={2}
            paddingTop={1}
            paddingRight={2}
            paddingLeft={2}
            paddingBottom={2}
          >
            <Box marginBottom={1}>
              <Typography variant="body1">Nueva {Label}</Typography>
            </Box>
            <Box width="100%" marginBottom={3}>
              <Box width={250} margin="0 auto">
                <GenericImageInput
                  label={`Foto principal del ${Label} (Opcional)`}
                  language="es"
                  onChange={(img: string) =>
                    (instance.attributes.img_picture = img)
                  }
                  height={170}
                  width="100%"
                  defaultValue={''}
                  isLoading={isLoading}
                />
              </Box>
            </Box>
            <TextField
              label={`Nueva ${Label}`}
              variant="outlined"
              size="small"
              type="text"
              required={true}
              value={instance.attributes.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                (instance.attributes.name = e.target.value)
              }
              disabled={isLoading}
              sx={{ width: '100%' }}
            />
            <GenericFormButtons
              language={system.language}
              label={Label}
              canDelete={true}
              id={instance.id}
              isLoading={isLoading}
              canSubmit={instance.attributes.name.length > 2}
              complete={instance.id ? true : false}
              onCancel={() => setNewEntry(false)}
              onDelete={() => {}}
              onComplete={() => CreateNewOption()}
            />
            {isLoading ? (
              <Box sx={{ width: '100%' }} marginTop={2}>
                <LinearProgress />
              </Box>
            ) : null}
          </Box>
        </Grid>
      ) : (
        <Grid item xs={12} sm={6}>
          <Box display="flex">
            {getImage() ? (
              <Box marginRight={1}>
                <Avatar
                  alt={value.toString()}
                  src={getImage()}
                  variant="rounded"
                  sx={{
                    width: 82,
                    height: 82,
                    boxShadow: '1px 1px 5px rgba(0,0,0,0.5)',
                    opacity: isLoading ? 0.5 : 1,
                  }}
                />
              </Box>
            ) : null}
            <Box display="flex" flexDirection="column">
              <Box
                display="flex"
                flexDirection="row"
                justifyContent="space-between"
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
                  disabled={isLoading}
                  sx={{
                    marginLeft: '10px',
                    textTransform: 'initial',
                  }}
                  onClick={() => {
                    instance.id = 0;
                    instance.attributes.name = '';
                    setNewEntry(true);
                  }}
                >
                  Nueva
                </Button>
              </Box>
              {!newEntry ? (
                <Typography variant="caption">
                  Si tu {Label} no se encuentra listada, da click en
                  <b> Nueva</b> para agregar una nueva {Label}.
                </Typography>
              ) : null}
            </Box>
            {isLoading ? (
              <Box sx={{ width: '100%' }} marginTop={2}>
                <LinearProgress />
              </Box>
            ) : null}
          </Box>
        </Grid>
      )}
    </>
  );
};

export default ProductClassificationField;
