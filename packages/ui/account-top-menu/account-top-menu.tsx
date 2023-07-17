import {
  ReactElement,
} from 'react';
import Grid from '@mui/material/Grid';
import {
  MenuItemWithIcon
} from 'ui';

interface MenuInterface {
  id: number;
  label: string;
  icon: ReactElement;
  selected: boolean;
};

interface Props {
  darkMode: boolean;
  menu: Array<MenuInterface>;
  menuCallback: (A: number) => void
};

const AccountTopMenu = ({
    darkMode,
    menu,
    menuCallback,
  }: Props): ReactElement => {

  return (
    <Grid
      container
      marginTop={1}
      marginBottom={2}
      columnSpacing={2}
      rowSpacing={2}>
      {
        menu.map(({id, icon, label, selected}: MenuInterface, index: number) => {
          return (
            <Grid item xs={4} sm={3} md={2} key={index}>
              <MenuItemWithIcon
                darkMode={darkMode}
                label={label}
                icon={icon}
                selected={selected}
                onClick={() => {
                  menuCallback(id);
                }} />
            </Grid>
          );
        })
      }
    </Grid>
  );
};

export default AccountTopMenu;
