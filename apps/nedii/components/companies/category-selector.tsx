import React, { ReactElement } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Category, { category } from 'classes/category';
import { useEffect } from '@preact-signals/safe-react/react';
import CategoryItem from 'components/companies/category-item';
import { system } from 'classes/system';
import Divider from '@mui/material/Divider';

type Props = {
  categorySelectedID: number;
  onSelect: (category: Category) => void;
};

const categories: Signal<Array<Category>> = signal([]);
const isLoading: Signal<boolean> = signal(false);

const CategorySelector = ({
  categorySelectedID = 0,
  onSelect,
}: Props): ReactElement => {
  useEffect(() => {
    system.setDataFromLocalStorage();
    isLoading.value = true;
    category
      .getCategories()
      .then((data) => (categories.value = data))
      .catch((e) => console.log('e:', e))
      .finally(() => (isLoading.value = false));
  }, []);

  return (
    <>
      {isLoading.value ? (
        <>
          <Typography variant="body1">Cargadon categorias...</Typography>
          <Grid item xs={12}>
            <Box sx={{ width: '100%' }}>
              <LinearProgress />
            </Box>
          </Grid>
        </>
      ) : (
        <>
          <Typography variant="body1" marginTop={1}>
            Seleccione una categoria para la empresa
          </Typography>
          <Box marginTop={2}>
            <Divider />
          </Box>
          <Grid container spacing={2} marginTop={0.5}>
            {categories.value.map((category: Category, index: number) => {
              category.selected = category.id === categorySelectedID;
              return (
                <Grid item xs={6} md={4} key={index}>
                  <CategoryItem
                    onClick={() => {
                      categories.value.map((i) => (i.selected = false));
                      category.selected = !category.selected;
                      onSelect(category);
                    }}
                    category={category}
                    selected={category.selected}
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

export default CategorySelector;
