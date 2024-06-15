import { ReactElement } from 'react';
import Grid from '@mui/material/Grid';
import MenuItemWithIcon from './menu-item-with-icon';

export type TopMenuItem = {
  id: number;
  label: string;
  href: string;
  icon: ReactElement;
  selected: boolean;
};

type Props = {
  darkMode: boolean;
  menu: Array<TopMenuItem>;
  menuCallback: (A: number) => void;
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
      rowSpacing={2}
    >
      {menu.map(
        ({ id, icon, label, href, selected }: TopMenuItem, index: number) => {
          return (
            <Grid item xs={4} sm={2} key={index}>
              <MenuItemWithIcon
                darkMode={darkMode}
                label={label}
                icon={icon}
                selected={selected}
                href={href}
              />
            </Grid>
          );
        }
      )}
    </Grid>
  );
};

export default AccountTopMenu;
