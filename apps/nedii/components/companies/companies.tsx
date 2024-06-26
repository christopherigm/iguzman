import React, { ReactElement, useEffect } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import User, { user } from 'classes/user';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import IconButton from '@mui/material/IconButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import Grid from '@mui/material/Grid';
import {
  MenuItemWithIcon,
  GenericFormButtons,
  VerticalMenuItemProps,
  VerticalMenu,
  ReturnButtonArrow,
} from '@repo/ui';
import Stand from 'classes/stand';
import CompanyFormDebugData from 'components/companies/company-form-debug-data';
import CompanyFormExpoInfo from 'components/companies/company-form-expo-info';
import CompanyFormBasicInfo from 'components/companies/company-form-basic-info';
import CompanyFormContactInfo from 'components/companies/company-form-contact-info';
import CompanyFormGallery from 'components/companies/company-form-gallery';
import { NewStandMenu, EditStandMenu } from './company-form-menu';
import Button from '@mui/material/Button';
import Products from 'components/product/products';
import { system } from 'classes/system';
import Divider from '@mui/material/Divider';
import { useMediaQuery, useTheme } from '@mui/material';

const menuItems: Signal<Array<VerticalMenuItemProps>> = signal([]);
const itemSelected: Signal<Array<VerticalMenuItemProps>> = signal([]);
const itemSelectedId: Signal<number> = signal(0);

const addOrEditCompany: Signal<boolean> = signal(false);
const currentCompany: Signal<Stand> = signal(new Stand());
const isLoading: Signal<boolean> = signal(false);

const Companies = (): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));
  itemSelected.value = menuItems.value.filter(
    (i: VerticalMenuItemProps) => i.selected
  );
  itemSelectedId.value =
    itemSelected.value.length && itemSelected.value[0]
      ? itemSelected.value[0].id
      : -1;

  useEffect(() => {
    console.log('Companies.tsx > renders');
    system.setDataFromLocalStorage();
    user.setDataFromLocalStorage();
    addOrEditCompany.value = false;
    isLoading.value = true;
    user.getUserCompaniesFromAPI().finally(() => (isLoading.value = false));
    ResetMenu();
  }, []);

  const ResetMenu = () => {
    if (currentCompany.value.id) {
      menuItems.value = [...EditStandMenu];
    } else {
      menuItems.value = [...NewStandMenu];
    }
    menuItems.value.map((i) => {
      i.selected = i.id === 0;
      i.completed = false;
    });
  };

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
        <Grid
          container
          marginTop={1}
          marginBottom={2}
          columnSpacing={2}
          rowSpacing={2}
        >
          <Grid item xs={12} sm={4} md={3}>
            <ReturnButtonArrow
              language={system.language}
              prevLabel="mis empresas"
              onClick={() => (addOrEditCompany.value = false)}
            />

            <VerticalMenu darkMode={system.darkMode} items={menuItems} />
          </Grid>
          <Grid item xs={12} sm={8} md={9}>
            {isXSSize ? (
              <Box marginTop={1} marginBottom={2}>
                <Divider />
              </Box>
            ) : null}
            <>
              {itemSelectedId.value === 0 ? (
                <CompanyFormExpoInfo
                  stand={currentCompany.value}
                  onCancel={() => updateCompletenessMenuItem(false)}
                  onIncomplete={() => updateCompletenessMenuItem(false)}
                  onComplete={() => updateCompletenessMenuItem(true)}
                />
              ) : null}
              {itemSelectedId.value === 1 ? (
                <CompanyFormBasicInfo
                  isLoading={isLoading.value}
                  stand={currentCompany.value}
                  onCancel={() => updateCompletenessMenuItem(false)}
                  onIncomplete={() => updateCompletenessMenuItem(false)}
                  onComplete={() => updateCompletenessMenuItem(true)}
                />
              ) : null}
              {itemSelectedId.value === 2 ? (
                <CompanyFormContactInfo
                  isLoading={isLoading.value}
                  darkMode={system.darkMode}
                  URLBase={system.URLBase}
                  stand={currentCompany.value}
                  onCancel={() => updateCompletenessMenuItem(false)}
                  onIncomplete={() => updateCompletenessMenuItem(false)}
                  onComplete={() => updateCompletenessMenuItem(true)}
                />
              ) : null}
              {itemSelectedId.value === 3 ? (
                <CompanyFormGallery
                  isLoading={isLoading.value}
                  darkMode={system.darkMode}
                  URLBase={system.URLBase}
                  stand={currentCompany.value}
                  onCancel={() => updateCompletenessMenuItem(false)}
                  onIncomplete={() => updateCompletenessMenuItem(false)}
                  onComplete={() => updateCompletenessMenuItem(true)}
                />
              ) : null}
              {itemSelectedId.value === 4 ? (
                <Products
                  darkMode={system.darkMode}
                  stand={currentCompany.value}
                />
              ) : null}
            </>
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
          {isLoading.value ? (
            <Grid item xs={12}>
              <Box sx={{ width: '100%' }}>
                <LinearProgress />
              </Box>
            </Grid>
          ) : null}
          {itemSelectedId.value < 4 ? (
            <GenericFormButtons
              language={system.language}
              label="Empresa"
              canDelete={true}
              id={currentCompany.value.id}
              isLoading={isLoading.value}
              complete={currentCompany.value.id ? true : false}
              onCancel={() => (addOrEditCompany.value = false)}
              onDelete={() => {}}
              onComplete={() => {
                isLoading.value = true;
                currentCompany.value
                  .save()
                  .catch((e) => console.log('error:', e))
                  .finally(() => (isLoading.value = false));
              }}
            />
          ) : null}
          {system.devMode ? (
            <CompanyFormDebugData
              darkMode={system.darkMode}
              stand={currentCompany.value}
            />
          ) : null}
        </Grid>
      ) : (
        <>
          <Typography variant="body1">Mis empresas</Typography>
          <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
            <Grid item xs={12} sm={3}>
              <MenuItemWithIcon
                darkMode={system.darkMode}
                icon={<AddIcon />}
                label="Agregar empresa"
                selected={false}
                isLoading={isLoading.value}
                onClick={() => {
                  goToNextMenuItem(0);
                  currentCompany.value = new Stand();
                  currentCompany.value.relationships.owner = {
                    data: new User(),
                  };
                  currentCompany.value.relationships.owner.data.id = user.id;
                  addOrEditCompany.value = true;
                  ResetMenu();
                }}
              />
            </Grid>
            {user.companies.map((i: Stand, index: number) => {
              return (
                <Grid item xs={6} sm={3} key={index}>
                  <Paper
                    elevation={2}
                    onClick={() => {
                      currentCompany.value = i;
                      currentCompany.value.relationships.owner = {
                        data: new User(),
                      };
                      currentCompany.value.relationships.owner.data.id =
                        user.id;
                      addOrEditCompany.value = true;
                      ResetMenu();
                    }}
                    sx={{
                      cursor: 'pointer',
                    }}
                  >
                    <Box
                      padding={1.5}
                      sx={{ opacity: isLoading ? '0.5' : '1' }}
                    >
                      {i.attributes.name}
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
            {isLoading.value ? (
              <Grid item xs={12}>
                <Box sx={{ width: '100%' }}>
                  <LinearProgress />
                </Box>
              </Grid>
            ) : null}
          </Grid>
        </>
      )}
    </>
  );
};

export default Companies;
