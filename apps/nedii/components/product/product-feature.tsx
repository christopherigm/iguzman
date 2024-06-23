import { ReactElement, useEffect, useState } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
import { GenericFormButtons, GenericImageInput } from '@repo/ui';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { API, RebuildData } from '@repo/utils';
import { DropDownField, DropDownFieldOption } from '@repo/ui';
import { productFeature } from 'classes/product/product-feature';
import ProductFeatureOption, {
  productFeatureOption,
} from 'classes/product/product-feature-option';

import { user } from 'classes/user';
import { system } from 'classes/system';

const Label = 'Caracteristica';

type Props = {
  standID: number;
  disabled?: boolean;
  onChange: (id: number) => void;
};

const ProductFeatureField = ({
  standID,
  disabled,
  onChange,
}: Props): ReactElement => {
  system.setDataFromLocalStorage();
  user.setDataFromLocalStorage();
  productFeature.URLBase = system.URLBase;
  productFeature.access = user.access;
  productFeature.relationships.stand.data.id = standID;
  productFeatureOption.URLBase = system.URLBase;
  productFeatureOption.access = user.access;
  productFeatureOption.relationships.feature.data.id = productFeature.id;
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // const [productFeatures, setProductFeatures] = useState<Array<ProductFeature>>([]);
  const [productFeatureOptions, setProductFeatureOptions] = useState<
    Array<DropDownFieldOption>
  >([]);

  const loadProductFeatureOptions = (): Promise<Array<DropDownFieldOption>> => {
    return new Promise((res, rej) => {
      setIsLoading(true);
      productFeatureOption
        .getDropDownItems()
        .then((items) => {
          setProductFeatureOptions(items);
          res(items);
        })
        .catch((e) => rej(e))
        .finally(() => setIsLoading(false));
    });
  };

  useEffect(() => {
    loadProductFeatureOptions().catch((e) => console.log(e));
  }, [productFeature.id]);

  return (
    <>
      <DropDownField
        label="Caracteristica del producto"
        language={system.language}
        value={productFeature.id}
        onChange={(id: number) => (productFeature.id = id)}
        imageEnabled={false}
        onSave={(data) => {
          productFeature.setDataFromPlainObject(data);
          return productFeature.save();
        }}
        onLoadItems={() => productFeature.getDropDownItems()}
        onDelete={(id: number) => {
          productFeature.id = id;
          return productFeature.delete();
        }}
        disabled={disabled}
      />
      <DropDownField
        label="Opciones de caracteristica"
        language={system.language}
        value={productFeatureOption.id}
        predefinedOptions={productFeatureOptions}
        onChange={(id: number) => (productFeatureOption.id = id)}
        imageEnabled={false}
        onSave={(data) => {
          setProductFeatureOptions([]);
          productFeatureOption.setDataFromPlainObject(data);
          return productFeatureOption.save();
        }}
        onLoadItems={() => loadProductFeatureOptions()}
        onDelete={(id: number) => {
          productFeatureOption.id = id;
          return productFeatureOption.delete();
        }}
        disabled={disabled || isLoading}
      />
    </>
  );
};

export default ProductFeatureField;
