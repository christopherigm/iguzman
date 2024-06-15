import { ReactElement, useEffect } from 'react';
import { user } from 'classes/user';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import { Signal, signal } from '@preact-signals/safe-react';
import {
  GenericFormButtons,
  MenuItemWithIcon,
  ReturnButtonArrow,
} from '@repo/ui';
import AddIcon from '@mui/icons-material/Add';
import Stand from 'classes/stand';
import Product from 'classes/product/product';

import ProductFormInfo from 'components/product/product-form-info';
import { system } from 'classes/system';
import BaseBuyableItem from 'components/base-buyable-item';

const isLoadingLocal: Signal<boolean> = signal(false);
const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

const addOrEdit: Signal<boolean> = signal(false);
const currentItem: Signal<Product> = signal(new Product());

type Props = {
  isLoading: boolean;
  darkMode: boolean;
  stand: Stand;
  onCancel: () => void;
  onIncomplete: () => void;
  onComplete: () => void;
};

const Products = ({
  isLoading = false,
  darkMode = false,
  stand,
  onCancel,
  onIncomplete,
  onComplete,
}: Props): ReactElement => {
  useEffect(() => {
    console.log('CompanyFormGallery.tsx > renders');
    system.setDataFromLocalStorage();
    user.setDataFromLocalStorage();
    // console.log('>>> stand.products.length:', stand.products.length);
    // console.log('>>> isLoadingLocal:', isLoadingLocal.value);
    // addOrEdit.value = false;
    if (!stand.products.length && !isLoadingLocal.value) {
      isLoadingLocal.value = true;
      complete.value = false;
      error.value = '';
      stand
        .getProductsFromAPI()
        .then((data) => {
          // console.log('data', data);
        })
        .catch((e) => console.log('error', e))
        .finally(() => (isLoadingLocal.value = false));
    }
  }, [stand.products.length]);

  const saveProduct = () => {
    isLoadingLocal.value = true;
    currentItem.value
      .save()
      .then(() => {
        console.log('Item created');
        addOrEdit.value = false;
        isLoadingLocal.value = false;
        stand.products = [];
      })
      .catch((e) => console.log(e))
      .finally(() => (isLoadingLocal.value = false));
  };

  return (
    <>
      {addOrEdit.value ? (
        <>
          <ReturnButtonArrow
            language={system.language}
            onClick={() => (addOrEdit.value = !addOrEdit.value)}
          />
          <ProductFormInfo
            isLoading={isLoading}
            darkMode={darkMode}
            standID={stand.id}
            item={currentItem.value}
            onCancel={() => (addOrEdit.value = !addOrEdit.value)}
            onIncomplete={() => {}}
            onComplete={() => saveProduct()}
          />
        </>
      ) : (
        <>
          <Typography variant="body1">Productos</Typography>
          <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
            <Grid item xs={12} sm={4}>
              <MenuItemWithIcon
                darkMode={darkMode}
                icon={<AddIcon />}
                label="Agregar producto"
                selected={false}
                isLoading={isLoadingLocal.value}
                onClick={() => {
                  currentItem.value = new Product();
                  currentItem.value.URLBase = system.URLBase;
                  currentItem.value.access = user.access;
                  currentItem.value.relationships.stand.data.id = stand.id;
                  currentItem.value.relationships.stand.data.attributes.setAttributesFromPlainObject(
                    stand.attributes.getPlainAttributes()
                  );
                  addOrEdit.value = true;
                }}
              />
            </Grid>
            {stand.products.map((i: Product, index: number) => {
              return (
                <Grid item xs={6} sm={4} key={index}>
                  <BaseBuyableItem
                    item={i}
                    onClick={() => {
                      currentItem.value.id = i.id;
                      currentItem.value.URLBase = system.URLBase;
                      currentItem.value.access = user.access;
                      currentItem.value.relationships.stand.data.id = stand.id;
                      currentItem.value.setDataFromPlainObject(
                        i.getPlainObject()
                      );
                      addOrEdit.value = true;
                    }}
                  />
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
    </>
  );
};

export default Products;
