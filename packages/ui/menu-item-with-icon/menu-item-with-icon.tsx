import {
  ReactElement,
  useEffect,
  useState,
} from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';

type Props = {
  selected?: boolean;
  darkMode: boolean;
  label: string;
  icon: any;
  onClick: (A: string) => void;
};

const MenuItemWithIcon = ({
    selected=false,
    darkMode,
    label,
    icon,
    onClick,
  }: Props): ReactElement => {
  const [elevation, setElevation] = useState<number>(selected ? 3 : 1);

  useEffect(() => setElevation(_p => selected ? 3 : 1), [selected]);

  return (
    <Paper
      elevation={elevation}
      onClick={() => onClick(label)}
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
  )
};

export default MenuItemWithIcon;
