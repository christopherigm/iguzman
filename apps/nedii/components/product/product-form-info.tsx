import { ReactElement, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { DropDownField } from '@repo/ui';
import BaseBuyableItemForm from 'components/base-buyable-item-form';
import Product from 'classes/product/product';
import ProductFeatureField from 'components/product/product-feature';
import { productClassification } from 'classes/product/product-classification';
import { user } from 'classes/user';
import { system } from 'classes/system';
import LinearProgress from '@mui/material/LinearProgress';

type Props = {
  disabled: boolean;
  darkMode: boolean;
  standID: number;
  item: Product;
  onCancel: () => void;
  onIncomplete: () => void;
  onComplete: () => void;
};

const ProductFormInfo = ({
  disabled = false,
  darkMode = false,
  standID,
  item,
  onCancel,
  onIncomplete,
  onComplete,
}: Props): ReactElement => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  productClassification.relationships.stand.data.id = standID;

  useEffect(() => {
    console.log('ProductFormInfo.tsx > renders');
    setIsLoading(true);
    system.setDataFromLocalStorage();
    user.setDataFromLocalStorage();
    item.setURLParametersForWholeObject();
    item.setStandFilterInURLParameters();
    item
      .setItemByIDFromAPI()
      .catch((e) => console.log('e:', e))
      .finally(() => setIsLoading(false));
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

  if (isLoading) {
    return (
      <Grid item xs={12}>
        <Box sx={{ width: '100%' }}>
          <LinearProgress />
        </Box>
      </Grid>
    );
  }

  return (
    <BaseBuyableItemForm
      isLoading={disabled}
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
          disabled={disabled}
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
        disabled={disabled}
      />
      <ProductFeatureField
        standID={standID}
        value={item.relationships.getProductFeatureOptionDropDownItems()}
        onChange={(items: Array<number>) =>
          item.relationships.updateProductFeatureOptions(items)
        }
        disabled={disabled}
      />
    </BaseBuyableItemForm>
  );
};

export default ProductFormInfo;
