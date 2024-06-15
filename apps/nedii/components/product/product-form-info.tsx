import { ReactElement, FormEvent, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';
import Stand from 'classes/stand';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import InputAdornment from '@mui/material/InputAdornment';

// import BaseBuyableItemClass from 'classes/base-buyable-item';
import BaseBuyableItemForm from 'components/base-buyable-item-form';
import Product from 'classes/product/product';

import ProductClassificationField from 'components/product/product-classification';

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
  useEffect(() => {
    console.log('ProductFormInfo.tsx > renders');
    isLoadingLocal.value = false;
    complete.value = false;
    error.value = '';
    // checkCompleteness();
  }, []);

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
      <ProductClassificationField
        standID={standID}
        value={item.relationships.classification.data.id}
        onChange={(id: number) =>
          (item.relationships.classification.data.id = id)
        }
      />
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
    </BaseBuyableItemForm>
  );
};

export default ProductFormInfo;
