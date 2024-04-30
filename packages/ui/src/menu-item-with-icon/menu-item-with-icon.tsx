import { ReactElement, useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Link from 'next/link';

type Props = {
  selected?: boolean;
  isLoading?: boolean;
  darkMode: boolean;
  label: string;
  icon: any;
  onClick?: (A: string) => void;
  href?: string;
};

const MenuItemWithIcon = ({
  selected = false,
  isLoading = false,
  darkMode,
  label,
  icon,
  onClick,
  href,
}: Props): ReactElement => {
  const [elevation, setElevation] = useState<number>(selected ? 3 : 1);

  useEffect(() => setElevation((_p) => (selected ? 3 : 1)), [selected]);

  const content = (
    <Box padding={1.5} sx={{ opacity: isLoading ? '0.5' : '1' }}>
      <Box
        display="flex"
        justifyContent="space-evenly"
        color={selected ? '#2196f3' : '#777'}
      >
        {icon}
      </Box>
      <Box marginTop={1}>
        <Divider />
      </Box>
      <Typography
        variant="body1"
        textAlign="center"
        color={
          darkMode ? 'primary.contrastText' : selected ? '#2196f3' : '#777'
        }
        paddingTop={1}
        noWrap={true}
      >
        {label}
      </Typography>
    </Box>
  );

  return (
    <Paper
      elevation={elevation}
      onClick={() => (isLoading || !onClick ? null : onClick(label))}
      onMouseLeave={() => setElevation((_p) => (selected ? 3 : 1))}
      onMouseOver={() => setElevation((_p) => 4)}
      sx={{
        cursor: 'pointer',
      }}
    >
      {href ? <Link href={href}>{content}</Link> : <>{content}</>}
    </Paper>
  );
};

export default MenuItemWithIcon;
