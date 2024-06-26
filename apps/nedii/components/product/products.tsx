import { ReactElement, useEffect, useState } from 'react';
import { user } from 'classes/user';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import { Signal, signal } from '@preact-signals/safe-react';
import { MenuItemWithIcon, ReturnButtonArrow } from '@repo/ui';
import AddIcon from '@mui/icons-material/Add';
import Stand from 'classes/stand';
import Product from 'classes/product/product';
import ProductFormInfo from 'components/product/product-form-info';
import { system } from 'classes/system';
import BaseBuyableItem from 'components/base-buyable-item';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';

const currentItem: Signal<Product> = signal(new Product());

type Props = {
  darkMode: boolean;
  stand: Stand;
};

const Products = ({ darkMode = false, stand }: Props): ReactElement => {
  const [items, setItems] = useState<Array<Product>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [newEntry, setNewEntry] = useState<boolean>(false);

  useEffect(() => {
    system.setDataFromLocalStorage();
    user.setDataFromLocalStorage();
    stand.relationships.setOwnerFromPlainObject(user.getPlainObject());
    if (!items.length && !isLoading) {
      loadItems().catch((e: any) => console.log(e));
    }
  }, [items.length]);

  const loadItems = (): Promise<void> => {
    return new Promise((res, rej) => {
      setIsLoading(true);
      currentItem.value.relationships.stand.data.id = stand.id;
      currentItem.value.setURLParametersForMinimumObject();
      currentItem.value.setStandFilterInURLParameters();
      currentItem.value
        .getItemsFromAPI()
        .then((data) => res(setItems(data)))
        .catch((e) => rej(e))
        .finally(() => setIsLoading(false));
    });
  };

  const saveProduct = () => {
    setIsLoading(true);
    currentItem.value
      .save()
      .then(() => (currentItem.value.attributes.version = 0))
      .catch((e) => console.log(e))
      .finally(() => setIsLoading(false));
  };

  return (
    <>
      {newEntry ? (
        <>
          <ReturnButtonArrow
            language={system.language}
            prevLabel="mis productos"
            onClick={() => {
              setNewEntry(false);
              loadItems();
            }}
          />
          <ProductFormInfo
            disabled={isLoading}
            darkMode={darkMode}
            standID={stand.id}
            item={currentItem.value}
            onCancel={() => setNewEntry(false)}
            onIncomplete={() => {}}
            onComplete={() => saveProduct()}
          />
        </>
      ) : (
        <>
          <Typography variant="body1" marginTop={1}>
            Productos
          </Typography>
          <Box marginTop={2}>
            <Divider />
          </Box>
          <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
            {isLoading ? (
              <Grid item xs={12}>
                <Box sx={{ width: '100%' }}>
                  <LinearProgress />
                </Box>
              </Grid>
            ) : (
              <>
                <Grid item xs={12} sm={4}>
                  <MenuItemWithIcon
                    darkMode={darkMode}
                    icon={<AddIcon />}
                    label="Agregar producto"
                    selected={false}
                    isLoading={isLoading}
                    onClick={() => {
                      currentItem.value = new Product();
                      currentItem.value.relationships.stand.data.id = stand.id;
                      currentItem.value.relationships.stand.data.attributes.setAttributesFromPlainObject(
                        stand.attributes.getPlainAttributes()
                      );
                      setNewEntry(true);
                    }}
                  />
                </Grid>
                {items.map((i: Product, index: number) => {
                  return (
                    <Grid item xs={12} sm={4} key={index}>
                      <BaseBuyableItem
                        item={i}
                        onClick={() => {
                          currentItem.value = i;
                          setNewEntry(true);
                        }}
                        disabled={isLoading}
                      />
                    </Grid>
                  );
                })}
              </>
            )}
          </Grid>
        </>
      )}
    </>
  );
};

export default Products;
