import { ReactNode } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';

type TitleProps = {
  children: ReactNode;
  title: string;
  darkMode: boolean;
};

const Title = ({ children, title, darkMode }: TitleProps): ReactNode => {
  return (
    <Box display="flex" alignItems="center">
      <Box color={darkMode ? 'white' : '#333'} marginRight={1}>
        {children}
      </Box>
      <Typography variant="body1" color={darkMode ? 'white' : '#333'}>
        <b>{title}</b>
      </Typography>
      <Box flexGrow={1} paddingLeft={1}>
        <Divider />
      </Box>
    </Box>
  );
};

export default Title;
