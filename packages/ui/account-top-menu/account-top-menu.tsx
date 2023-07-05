import {
  ReactElement,
  useEffect,
  useState
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';

interface ItemProps {
  id: number;
  selected?: boolean;
  darkMode: boolean;
  label: string;
  icon: any;
  onClick: (A: number) => void
};

const TopMenuItem = ({
    id,
    selected=false,
    darkMode,
    label,
    icon,
    onClick,
  }: ItemProps): ReactElement => {
  const [elevation, setElevation] = useState<number>(selected ? 3 : 1);

  useEffect(() => setElevation(_p => selected ? 3 : 1), [selected]);

  return (
    <Grid item xs={4} sm={3} md={2}>
      <Paper
        elevation={elevation}
        onClick={() => onClick(id)}
        onMouseLeave={() => setElevation(_p => selected ? 3 : 1)}
        onMouseOver={() => setElevation(_p => 4)}
        sx={{
          cursor: 'pointer'
        }}>
        <Box padding={1.5}>
          <Box
            display='flex'
            justifyContent='space-evenly'
            color={selected ? '#2196f3' : '#777'}>
            {icon}
          </Box>
          <Box
            marginTop={1}>
            <Divider />
          </Box>
          <Typography
            variant='body1'
            textAlign='center'
            color={darkMode ? 'primary.contrastText' : selected ? '#2196f3' : '#777'}
            paddingTop={1}
            noWrap={true}>
            {label}
          </Typography>
        </Box>
      </Paper>
    </Grid>
  )
};

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
            <TopMenuItem
              darkMode={darkMode}
              id={id}
              icon={icon}
              label={label}
              selected={selected}
              onClick={menuCallback}
              key={index} />
          )
        })
      }
    </Grid>
  );
};

export default AccountTopMenu;
