import React, { ReactElement, useEffect } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import User, { user } from 'classes/user';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
import AddIcon from '@mui/icons-material/Add';
import Grid from '@mui/material/Grid';
import { MenuItemWithIcon } from '@repo/ui';
import { VerticalMenu } from '@repo/ui';
import type { VerticalMenuItemProps } from '@repo/ui';
import Stand from 'classes/stand';
import CompanyFormDebugData from 'components/companies/company-form-debug-data';
import CompanyFormExpoInfo from 'components/companies/company-form-expo-info';
import CompanyFormBasicInfo from 'components/companies/company-form-basic-info';
import CompanyFormContactInfo from 'components/companies/company-form-contact-info';
import CompanyFormGallery from 'components/companies/company-form-gallery';
import menuItems from './company-form-menu';
import CompanyFormButtons from './company-form-buttons';
import Button from '@mui/material/Button';

const itemSelected: Signal<Array<VerticalMenuItemProps>> = signal(
  menuItems.value.filter((i: VerticalMenuItemProps) => i.selected)
);
const itemSelectedId: Signal<number> = signal(
  (itemSelected.value.length ? itemSelected.value[0]?.id : -1) || -1
);

const addOrEditCompany: Signal<boolean> = signal(false);
const currentCompany: Signal<Stand> = signal(new Stand());
const isLoading: Signal<boolean> = signal(false);

type Props = {
  darkMode: boolean;
  devMode: boolean;
  URLBase: string;
};

const Companies = ({
  darkMode = false,
  devMode = false,
  URLBase,
}: Props): ReactElement => {
  itemSelected.value = menuItems.value.filter(
    (i: VerticalMenuItemProps) => i.selected
  );
  itemSelectedId.value =
    itemSelected.value.length && itemSelected.value[0]
      ? itemSelected.value[0].id
      : -1;

  useEffect(() => {
    console.log('Companies.tsx > renders');
    menuItems.value.map((i) => (i.completed = false));
    addOrEditCompany.value = false;
    isLoading.value = true;
    user.getNediiUserFromLocalStorage();
    user.URLBase = URLBase;
    user.getUserCompaniesFromAPI().finally(() => (isLoading.value = false));
  }, []);

  // const onComplete = () => {
  //   addOrEditCompany.value = false;
  //   isLoading.value = true;
  //   user.getUserCompaniesFromAPI().finally(() => (isLoading.value = false));
  // };

  const goToNextMenuItem = (id?: number) => {
    itemSelectedId.value = id ?? itemSelectedId.value + 1;
    menuItems.value.map((i: VerticalMenuItemProps) => {
      i.selected = i.id === itemSelectedId.value;
      return i;
    });
    menuItems.value = [...menuItems.value];
  };

  const updateCompletenessMenuItem = (value: boolean = false): void => {
    menuItems.value.map((i) => {
      if (i.id === itemSelectedId.value) {
        i.completed = value;
      }
      return i;
    });
    menuItems.value = [...menuItems.value];
  };

  return (
    <>
      {addOrEditCompany.value ? (
        <Grid container marginTop={1} columnSpacing={2} rowSpacing={2}>
          <Grid item xs={12}>
            <Typography variant="body1">
              {currentCompany.value.id
                ? `Editar empresa ${currentCompany.value.attributes.name ?? ''}`
                : currentCompany.value.attributes.name
                  ? `Agregando nueva empresa "${currentCompany.value.attributes.name}"`
                  : 'Agregar nueva empresa'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <VerticalMenu darkMode={darkMode} items={menuItems} />
          </Grid>
          <Grid item xs={12} sm={8} md={9}>
            <Paper elevation={1}>
              <Box padding={1.5}>
                {itemSelectedId.value === 0 ? (
                  <CompanyFormExpoInfo
                    darkMode={darkMode}
                    URLBase={URLBase}
                    stand={currentCompany.value}
                    onCancel={() => updateCompletenessMenuItem(false)}
                    onIncomplete={() => updateCompletenessMenuItem(false)}
                    onComplete={() => updateCompletenessMenuItem(true)}
                  />
                ) : null}
                {itemSelectedId.value === 1 ? (
                  <CompanyFormBasicInfo
                    darkMode={darkMode}
                    URLBase={URLBase}
                    stand={currentCompany.value}
                    onCancel={() => updateCompletenessMenuItem(false)}
                    onIncomplete={() => updateCompletenessMenuItem(false)}
                    onComplete={() => updateCompletenessMenuItem(true)}
                  />
                ) : null}
                {itemSelectedId.value === 2 ? (
                  <CompanyFormContactInfo
                    darkMode={darkMode}
                    URLBase={URLBase}
                    stand={currentCompany.value}
                    onCancel={() => updateCompletenessMenuItem(false)}
                    onIncomplete={() => updateCompletenessMenuItem(false)}
                    onComplete={() => updateCompletenessMenuItem(true)}
                  />
                ) : null}
                {itemSelectedId.value === 3 ? (
                  <CompanyFormGallery
                    darkMode={darkMode}
                    URLBase={URLBase}
                    stand={currentCompany.value}
                    onCancel={() => updateCompletenessMenuItem(false)}
                    onIncomplete={() => updateCompletenessMenuItem(false)}
                    onComplete={() => updateCompletenessMenuItem(true)}
                  />
                ) : null}
              </Box>
            </Paper>
            <Box
              display="flex"
              flexDirection="row"
              justifyContent="end"
              marginTop={2}
            >
              {itemSelected.value[0]?.completed ? (
                <Button
                  variant="contained"
                  size="small"
                  disabled={
                    isLoading.value ||
                    itemSelectedId.value > menuItems.value.length - 1
                  }
                  onClick={() => goToNextMenuItem()}
                  color="success"
                  sx={{ textTransform: 'initial' }}
                >
                  Siguiente
                </Button>
              ) : null}
            </Box>
          </Grid>
          <Grid item xs={12} marginBottom={2}>
            <CompanyFormButtons
              standID={currentCompany.value.id}
              isLoading={false}
              complete={false}
              canSubmit={() => false}
              onCancel={() => {}}
              onDelete={() => {}}
            />
          </Grid>
          {devMode ? (
            <CompanyFormDebugData
              darkMode={darkMode}
              stand={currentCompany.value}
            />
          ) : null}
        </Grid>
      ) : (
        <>
          <Paper elevation={1}>
            <Box padding={1.5}>
              <Typography variant="body2">Mis empresas</Typography>
              <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
                <Grid item xs={4} sm={2}>
                  <MenuItemWithIcon
                    darkMode={darkMode}
                    icon={<AddIcon />}
                    label="Agregar empresa"
                    selected={false}
                    isLoading={isLoading.value}
                    onClick={() => {
                      goToNextMenuItem(0);
                      currentCompany.value = new Stand();
                      currentCompany.value.URLBase = user.URLBase;
                      currentCompany.value.access = user.access;
                      currentCompany.value.relationships.owner = {
                        data: new User(),
                      };
                      currentCompany.value.relationships.owner.data.id =
                        user.id;
                      addOrEditCompany.value = true;
                    }}
                  />
                </Grid>
                {isLoading.value ? (
                  <Grid item xs={12}>
                    <Box sx={{ width: '100%' }}>
                      <LinearProgress />
                    </Box>
                  </Grid>
                ) : null}
              </Grid>
            </Box>
          </Paper>
        </>
      )}
    </>
  );
};

export default Companies;
