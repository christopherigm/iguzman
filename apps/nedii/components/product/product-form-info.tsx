import { ReactElement, FormEvent, useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';
import Stand, { stand } from 'classes/stand';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import InputAdornment from '@mui/material/InputAdornment';
import { DropDownField, DropDownFieldOption } from '@repo/ui';

// import BaseBuyableItemClass from 'classes/base-buyable-item';
import BaseBuyableItemForm from 'components/base-buyable-item-form';
import Product from 'classes/product/product';

// import ProductClassificationField from 'components/product/product-classification';
import ProductFeatureField from 'components/product/product-feature';

// import { productFeature } from 'classes/product/product-feature';
// import { productFeatureOption } from 'classes/product/product-feature-option';
import { productClassification } from 'classes/product/product-classification';
import { user } from 'classes/user';
import { system } from 'classes/system';

const isLoadingLocal: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  isLoading: boolean;
  darkMode: boolean;
  standID: number;
  item: Product;
  onCancel: () => void;
  onIncomplete: () => void;
  onComplete: () => void;
};

const ProductFormInfo = ({
  isLoading = false,
  darkMode = false,
  standID,
  item,
  onCancel,
  onIncomplete,
  onComplete,
}: Props): ReactElement => {
  system.setDataFromLocalStorage();
  user.setDataFromLocalStorage();
  productClassification.URLBase = system.URLBase;
  productClassification.access = user.access;
  productClassification.relationships.stand.data.id = standID;

  const [productFeatures, setProductFeatures] = useState<Array<any>>([]);
  const [productFeatureOptions, setProductFeatureOptions] = useState<
    Array<any>
  >([]);

  useEffect(() => {
    console.log('ProductFormInfo.tsx > renders');
    isLoadingLocal.value = false;
    complete.value = false;
    error.value = '';
    // checkCompleteness();
  }, []);

  const updateProductFeatureOptions = (options: Array<any> = [], id = 0) => {
    setProductFeatureOptions([]);
    options.map((i: any) => {
      if (Number(i.id) === id && i.relationships?.options?.data?.length) {
        const newOptions = i.relationships.options.data.map((i: any) => {
          const newItem = {
            id: Number(i.id),
            label: i.attributes.name,
            image: i.attributes.img_picture,
          };
          return newItem;
        });
        setProductFeatureOptions(newOptions);
      }
    });
  };

  const checkCompleteness = (): void => {
    // if (
    //   item.attributes.name &&
    //   item.attributes.description &&
    //   item.attributes.short_description
    // ) {
    //   onComplete();
    // } else {
    //   onIncomplete();
    // }
  };

  return (
    <BaseBuyableItemForm
      isLoading={isLoading || isLoadingLocal.value}
      darkMode={darkMode}
      label="Producto"
      item={item}
      checkCompleteness={() => checkCompleteness}
      onCancel={() => onCancel()}
      onComplete={() => onComplete()}
    >
      <Grid item xs={12} sm={6}>
        <TextField
          label="Marca del producto"
          variant="outlined"
          size="small"
          type="text"
          value={item.attributes.brand}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            (item.attributes.brand = e.target.value)
          }
          disabled={isLoading}
          style={{ width: '100%' }}
        />
      </Grid>
      <DropDownField
        label="Clasificacion del producto"
        language={system.language}
        value={item.relationships.classification.data.id}
        onChange={(id: number) =>
          (item.relationships.classification.data.id = id)
        }
        onSave={(data) => {
          productClassification.setDataFromPlainObject(data);
          return productClassification.save();
        }}
        onLoadItems={() => productClassification.getDropDownItems()}
        onDelete={(id: number) => {
          productClassification.id = id;
          return productClassification.delete();
        }}
        disabled={isLoading}
      />
      <ProductFeatureField
        disabled={isLoading}
        standID={standID}
        onChange={(id) => {}}
      />
    </BaseBuyableItemForm>
  );
};

export default ProductFormInfo;
