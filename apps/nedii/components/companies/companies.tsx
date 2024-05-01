import React, { ReactElement, useEffect } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import Grid from '@mui/material/Grid';
import { user } from 'classes/user';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
import AddIcon from '@mui/icons-material/Add';
import { MenuItemWithIcon } from '@repo/ui';
import { VerticalMenu } from '@repo/ui';
import type { VerticalMenuItemProps } from '@repo/ui';
import Stand from 'classes/stand';
import CompanyForm from 'components/companies/company-form';
import menuItems from './company-form-menu';
import CompanyFormButtons from './company-form-buttons';
import GroupSelector from 'components/companies/group-selector';
import Group from 'classes/group';

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
  URLBase: string;
};

const Companies = ({ darkMode = false, URLBase }: Props): ReactElement => {
  itemSelected.value = menuItems.value.filter(
    (i: VerticalMenuItemProps) => i.selected
  );
  itemSelectedId.value =
    itemSelected.value.length && itemSelected.value[0]
      ? itemSelected.value[0].id
      : -1;

  useEffect(() => {
    addOrEditCompany.value = false;
    isLoading.value = true;
    user.getNediiUserFromLocalStorage();
    user.URLBase = URLBase;
    user.getUserCompaniesFromAPI().finally(() => (isLoading.value = false));
  }, []);

  const onComplete = () => {
    addOrEditCompany.value = false;
    isLoading.value = true;
    user.getUserCompaniesFromAPI().finally(() => (isLoading.value = false));
    // console.log(menuItems.value[0]);
    // if (menuItems.value[0]) {
    //   menuItems.value[0].completed = true;
    // }
    // menuItems.value = [...menuItems.value];
  };

  return (
    <>
      {addOrEditCompany.value ? (
        <Grid container marginTop={1} columnSpacing={2} rowSpacing={2}>
          <Grid item xs={12}>
            <Typography variant="body2">
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
                  <GroupSelector
                    URLBase={URLBase}
                    onSelect={(g: Group) => {
                      console.log('group:', g);
                    }}
                  />
                ) : null}
                {itemSelectedId.value === 1 ? (
                  <CompanyForm
                    darkMode={darkMode}
                    stand={currentCompany.value}
                    onCancel={() => {
                      onComplete();
                      // addOrEditCompany.value = false;
                    }}
                    onComplete={() => onComplete()}
                  />
                ) : null}
              </Box>
            </Paper>
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
                      currentCompany.value = new Stand();
                      currentCompany.value.URLBase = user.URLBase;
                      currentCompany.value.access = user.access;
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
