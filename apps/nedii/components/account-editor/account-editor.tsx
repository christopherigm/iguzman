import React, { ReactElement, useEffect } from 'react';
import Grid from '@mui/material/Grid';
import UserAddress from './user-address';
import UserInfo from './user-info';
import { user } from 'classes/user';
import { VerticalMenu } from '@repo/ui';
import type { VerticalMenuItemProps } from '@repo/ui';
import { Signal, signal } from '@preact-signals/safe-react';

const menuItems: Signal<Array<VerticalMenuItemProps>> = signal([
  {
    id: 0,
    label: 'Informacion de usuario',
    selected: true,
    completeIcon: null,
    incompleteIcon: null,
  },
  {
    id: 1,
    label: 'Direcciones de usuario',
    selected: false,
    completeIcon: null,
    incompleteIcon: null,
  },
]);

const itemSelected: Signal<Array<VerticalMenuItemProps>> = signal(
  menuItems.value.filter((i: VerticalMenuItemProps) => i.selected)
);
const itemSelectedId: Signal<number> = signal(
  (itemSelected.value.length ? itemSelected.value[0]?.id : -1) || -1
);

type Props = {
  darkMode: boolean;
  URLBase: string;
};

const AccountEditor = ({ darkMode = false, URLBase }: Props): ReactElement => {
  useEffect(() => {
    user.setDataFromLocalStorage();
  }, []);

  itemSelected.value = menuItems.value.filter(
    (i: VerticalMenuItemProps) => i.selected
  );
  itemSelectedId.value =
    itemSelected.value.length && itemSelected.value[0]
      ? itemSelected.value[0].id
      : -1;

  return (
    <>
      {user.id ? (
        <Grid container marginTop={1} columnSpacing={2} rowSpacing={2}>
          <Grid item xs={12} sm={4} md={3} marginBottom={2}>
            <VerticalMenu darkMode={darkMode} items={menuItems} />
          </Grid>
          {itemSelectedId.value === 0 ? (
            <Grid item xs={12} sm={8} md={9} marginBottom={2}>
              <UserInfo darkMode={darkMode} />
            </Grid>
          ) : null}
          {itemSelectedId.value === 1 ? (
            <Grid item xs={12} sm={8} md={9} marginBottom={2}>
              <UserAddress darkMode={darkMode} />
            </Grid>
          ) : null}
        </Grid>
      ) : null}
    </>
  );
};

export default AccountEditor;
