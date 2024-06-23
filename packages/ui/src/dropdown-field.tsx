import { ReactElement, useEffect, useState } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import { GenericFormButtons, GenericImageInput, Dialog } from '@repo/ui';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { Languages } from '@repo/utils';
import Avatar from '@mui/material/Avatar';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DelteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';

export type DropDownFieldOption = {
  id: number;
  name: string;
  img_picture?: string;
};

type Props = {
  language: Languages;
  label: string;
  value: number;
  disabled?: boolean;
  imageEnabled?: boolean;
  predefinedOptions?: Array<DropDownFieldOption>;
  onChange: (id: number) => void;
  onSave: (props: any) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onLoadItems: () => Promise<Array<DropDownFieldOption>>;
};

const valueIsInOptions: Signal<boolean> = signal(false);

const DropDownField = ({
  language = 'en',
  label,
  value,
  disabled = false,
  imageEnabled = true,
  predefinedOptions,
  onChange,
  onSave,
  onDelete,
  onLoadItems,
}: Props): ReactElement => {
  const [options, setOptions] = useState<Array<any>>(
    predefinedOptions !== undefined ? predefinedOptions : []
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [newEntry, setNewEntry] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newImage, setNewImage] = useState<string>('');
  const [id, setID] = useState<number>(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);

  valueIsInOptions.value = options.map((i) => i.id).indexOf(value) >= 0;

  const getCurrentOption = (): DropDownFieldOption => {
    let option: DropDownFieldOption = {
      id: 0,
      name: '',
    };
    options.map((i: DropDownFieldOption) => {
      if (Number(i.id) === value) {
        option.id = i.id;
        option.name = i.name;
        if (i.img_picture) {
          option.img_picture = i.img_picture;
        }
      }
    });
    return option;
  };

  const updateDefaultOptionSelected = (
    options: Array<DropDownFieldOption>,
    value: number
  ): void => {
    valueIsInOptions.value = options.map((i) => i.id).indexOf(value) >= 0;
    if (!value && options.length && options[0]) {
      onChange(options[0].id);
    } else if (!valueIsInOptions.value && options.length && options[0]) {
      onChange(options[0].id);
    }
  };

  const getLabel = (): string => {
    return !options.length && isLoading ? 'Cargando opciones' : label;
  };

  useEffect(() => {
    if (!isLoading) {
      if (!options.length && predefinedOptions === undefined) {
        setNewEntry(false);
        onLoadItems().then((options: Array<DropDownFieldOption>) => {
          setOptions(options);
          updateDefaultOptionSelected(options, value);
        });
      } else if (predefinedOptions !== undefined) {
        setOptions(predefinedOptions);
        updateDefaultOptionSelected(predefinedOptions, value);
      }
    }
  }, [
    value,
    options.length,
    predefinedOptions !== undefined && predefinedOptions.length,
  ]);

  if ((isLoading || (isLoading && !valueIsInOptions.value)) && !newEntry) {
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
      {newEntry || (!options.length && predefinedOptions === undefined) ? (
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
              <Typography variant="body1">Nueva {label}</Typography>
            </Box>
            {imageEnabled ? (
              <Box width="100%" marginBottom={3}>
                <Box width={250} margin="0 auto">
                  <GenericImageInput
                    label={`Foto principal del ${label} (Opcional)`}
                    language={language}
                    onChange={(img: string) => setNewImage(img)}
                    height={170}
                    width="100%"
                    defaultValue={newImage}
                    isLoading={isLoading || disabled}
                  />
                </Box>
              </Box>
            ) : null}
            <TextField
              label={`Nueva ${label}`}
              variant="outlined"
              size="small"
              type="text"
              required={true}
              value={newName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewName(e.target.value)
              }
              disabled={isLoading || disabled}
              sx={{ width: '100%' }}
            />
            <GenericFormButtons
              language={language}
              label={label}
              canDelete={true}
              id={id}
              isLoading={isLoading || disabled}
              canSubmit={newName.length > 2}
              complete={id ? true : false}
              onCancel={() => setNewEntry(false)}
              onDelete={() => {}}
              onComplete={() => {
                setIsLoading(true);
                onSave({
                  ...(id && {
                    id: id,
                  }),
                  attributes: {
                    name: newName,
                    ...(imageEnabled && {
                      img_picture: newImage,
                    }),
                  },
                })
                  .then((response: any) => {
                    const newID = Number(response.data?.id ?? value);
                    onChange(newID);
                    onLoadItems().then(
                      (options: Array<DropDownFieldOption>) => {
                        setOptions(options);
                        updateDefaultOptionSelected(options, newID);
                      }
                    );
                  })
                  .finally(() => {
                    setIsLoading(false);
                    setNewEntry(false);
                  });
              }}
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
            {imageEnabled && getCurrentOption().img_picture ? (
              <Box
                marginRight={1}
                onClick={() => {
                  const item: Array<DropDownFieldOption> = options.filter(
                    (i: DropDownFieldOption) => i.id === value
                  );
                  if (item.length && item[0]) {
                    setID(item[0].id);
                    setNewName(item[0].name);
                    setNewImage(item[0].img_picture ?? '');
                    setNewEntry(true);
                  }
                }}
              >
                <Avatar
                  alt={value.toString()}
                  src={getCurrentOption().img_picture}
                  variant="rounded"
                  sx={{
                    width: 64,
                    height: 80,
                    boxShadow: '1px 1px 5px rgba(0,0,0,0.5)',
                    opacity: isLoading ? 0.5 : 1,
                  }}
                />
              </Box>
            ) : null}
            <Box display="flex" flexDirection="column" width="100%">
              <FormControl fullWidth>
                <InputLabel id={`value-${label}-label`}>
                  {getLabel()}
                </InputLabel>
                <Select
                  labelId={`value-${label}-label`}
                  id={`value-${label}`}
                  value={String(value)}
                  label={getLabel()}
                  disabled={isLoading || !options.length || disabled}
                  size="small"
                  onChange={(e: SelectChangeEvent) =>
                    onChange(Number(e.target.value))
                  }
                >
                  {options.map((i: DropDownFieldOption, index: number) => {
                    return (
                      <MenuItem key={index} value={i.id}>
                        {i.name}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              <Box display="flex" justifyContent="end" marginTop={1}>
                <IconButton
                  aria-label="delete"
                  sx={{
                    marginLeft: '10px',
                    color: 'white',
                    backgroundColor: '#d32f2f',
                  }}
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={isLoading || disabled || !options.length}
                >
                  <DelteIcon />
                </IconButton>
                <IconButton
                  aria-label="edit"
                  sx={{
                    marginLeft: '10px',
                    color: 'white',
                    backgroundColor: '#f57c00',
                  }}
                  onClick={() => {
                    const item: Array<DropDownFieldOption> = options.filter(
                      (i: DropDownFieldOption) => i.id === value
                    );
                    if (item.length && item[0]) {
                      setID(item[0].id);
                      setNewName(item[0].name);
                      setNewImage(item[0].img_picture ?? '');
                      setNewEntry(true);
                    }
                  }}
                  disabled={isLoading || disabled || !options.length}
                >
                  <EditIcon />
                </IconButton>
                <Button
                  variant="contained"
                  disabled={isLoading || disabled}
                  sx={{
                    marginLeft: '10px',
                    textTransform: 'initial',
                  }}
                  onClick={() => {
                    setID(0);
                    setNewImage('');
                    setNewName('');
                    setNewEntry(true);
                  }}
                  size="small"
                  endIcon={<AddIcon />}
                >
                  Nueva
                </Button>
              </Box>
            </Box>
            {isLoading ? (
              <Box sx={{ width: '100%' }} marginTop={2}>
                <LinearProgress />
              </Box>
            ) : null}
            {deleteDialogOpen ? (
              <Dialog
                language={language}
                title={`Eliminar ${label}?`}
                text={`Esta seguro que desea eliminar ${label} "${
                  getCurrentOption().name
                }"?`}
                open={deleteDialogOpen}
                onAgreed={() => {
                  setDeleteDialogOpen(false);
                  setIsLoading(true);
                  onDelete(value)
                    .then(() => {
                      onLoadItems().then(
                        (options: Array<DropDownFieldOption>) => {
                          setOptions(options);
                          updateDefaultOptionSelected(options, 0);
                        }
                      );
                    })
                    .catch((e) => console.log(e))
                    .finally(() => setIsLoading(false));
                }}
                onCancel={() => setDeleteDialogOpen(false)}
              />
            ) : null}
          </Box>
        </Grid>
      )}
    </>
  );
};

export default DropDownField;
