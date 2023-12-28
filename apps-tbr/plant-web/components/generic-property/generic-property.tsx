import {ReactElement} from 'react';
import Typography from '@mui/material/Typography';

interface Props {
  label: string;
  value: string;
  darkMode: boolean;
  marginTop?: number;
  marginBottom?: number; 
}

const GenericProperty = ({
    label,
    value,
    darkMode,
    marginTop = 0,
    marginBottom = 0,
  }: Props): ReactElement => {
  return (
    <Typography
      variant='body1'
      color={darkMode ? 'primary.contrastText' : ''}
      marginTop={marginTop}
      marginBottom={marginBottom}>
      {label}: {value}
    </Typography>
  );
};

export default GenericProperty;
