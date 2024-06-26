import { ReactElement, useEffect, useState } from 'react';
import { DropDownField, DropDownFieldOption } from '@repo/ui';
import { user } from 'classes/user';
import { system } from 'classes/system';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { productFeature as parent } from 'classes/product/product-feature';
import { productFeatureOption as option } from 'classes/product/product-feature-option';

type Props = {
  standID: number;
  value: Array<DropDownFieldOption>;
  onChange: (items: Array<DropDownFieldOption>) => void;
  disabled?: boolean;
};

const ProductFeatureField = ({
  standID,
  value,
  onChange,
  disabled,
}: Props): ReactElement => {
  system.setDataFromLocalStorage();
  user.setDataFromLocalStorage();
  parent.relationships.stand.data.id = standID;
  option.relationships.feature.data.id = parent.id;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [productFeatureOptions, setProductFeatureOptions] = useState<
    Array<DropDownFieldOption>
  >([]);
  const [selectedOptions, setSelectedOptions] = useState<
    Array<DropDownFieldOption>
  >([]);

  useEffect(() => {
    if (!productFeatureOptions.length) {
      setSelectedOptions(value);
    }
    if (!productFeatureOptions.length) {
      loadProductFeatureOptions().catch((e) => console.log(e));
    }
  }, [value.length, parent.id, productFeatureOptions.length]);

  const loadProductFeatureOptions = (): Promise<Array<DropDownFieldOption>> => {
    return new Promise((res, rej) => {
      setIsLoading(true);
      option
        .getDropDownItems()
        .then((items) => {
          setProductFeatureOptions(items);
          res(items);
        })
        .catch((e) => rej(e))
        .finally(() => setIsLoading(false));
    });
  };

  const updateSelectedOptions = (
    id: number,
    action: 'add' | 'remove' = 'add'
  ) => {
    const newSelectedOptionsArray: Array<DropDownFieldOption> = [
      ...selectedOptions,
    ];
    const opt = (
      action === 'add' ? productFeatureOptions : newSelectedOptionsArray
    ).filter((i) => i.id === id);
    if (opt && opt.length && opt[0]) {
      if (action === 'add') {
        newSelectedOptionsArray.push(opt[0]);
      } else {
        const indexToDelete = newSelectedOptionsArray.indexOf(opt[0]);
        if (indexToDelete > -1) {
          newSelectedOptionsArray.splice(indexToDelete, 1);
        }
      }
      setSelectedOptions(newSelectedOptionsArray);
      onChange(newSelectedOptionsArray);
    }
  };

  return (
    <>
      <Grid item xs={12}>
        <Box marginTop={3} marginBottom={2}>
          <Divider />
        </Box>
        <Typography variant="body1">Caracteristicas del producto</Typography>
        <Typography variant="body2">
          Seleccione las caracteristicas de su producto y sus correspondientes
          opciones, puede seleccionar mas de una opcion. Si no hay
          caracteristicas, puede crear tantas sean necesarias para describir su
          producto. Luego de click en el boton
          <b> "Agregar Opcion"</b> para realizar la seleccion.
        </Typography>
      </Grid>
      <DropDownField
        label="Caracteristica del producto"
        language={system.language}
        value={parent.id}
        onChange={(id: number) => {
          parent.id = id;
          setProductFeatureOptions([]);
        }}
        imageEnabled={false}
        onSave={(data) => {
          parent.setDataFromPlainObject(data);
          option.id = 0;
          return parent.save();
        }}
        onLoadItems={() => parent.getDropDownItems()}
        onDelete={(id: number) => {
          parent.id = id;
          return parent.delete();
        }}
        disabled={disabled}
      />
      <DropDownField
        label="Opciones de caracteristica"
        language={system.language}
        value={option.id}
        predefinedOptions={productFeatureOptions}
        onChange={(id: number) => (option.id = id)}
        imageEnabled={false}
        onSave={(data) => {
          setProductFeatureOptions([]);
          option.id = 0;
          option.setDataFromPlainObject(data);
          return option.save();
        }}
        onLoadItems={() => loadProductFeatureOptions()}
        onDelete={(id: number) => {
          option.id = id;
          return option.delete();
        }}
        disabled={disabled || isLoading}
      />
      <Grid item xs={12} display="flex" justifyContent="center">
        <Button
          variant="contained"
          size="small"
          onClick={() => updateSelectedOptions(option.id, 'add')}
          color="success"
          sx={{ textTransform: 'initial' }}
          disabled={
            disabled ||
            isLoading ||
            !option.id ||
            selectedOptions.filter((i) => i.id === option.id).length > 0
          }
        >
          Agregar opcion
        </Button>
      </Grid>
      <Grid item xs={12}>
        {selectedOptions.length ? (
          <Box
            display="flex"
            flexWrap="wrap"
            justifyContent="center"
            border="solid 1px #bbb"
            borderRadius={1}
            paddingBottom={1}
          >
            {selectedOptions.map((i, index: number) => {
              return (
                <Box key={index} marginTop={1} marginRight={1}>
                  <Chip
                    label={i.name}
                    variant="outlined"
                    onDelete={() => updateSelectedOptions(i.id, 'remove')}
                    disabled={disabled || isLoading}
                  />
                </Box>
              );
            })}
          </Box>
        ) : null}
        <Box marginTop={2} marginBottom={2}>
          <Divider />
        </Box>
      </Grid>
    </>
  );
};

export default ProductFeatureField;
