import { ReactElement } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';

type Props = {
  children: any;
  marginTop?: number;
  elevation?: number;
  padding?: number;
};

const PaperCard = ({
  children,
  elevation = 1,
  marginTop = 3,
  padding = 1.5,
}: Props): ReactElement => {
  return (
    <Box marginTop={marginTop}>
      <Paper elevation={elevation}>
        <Box padding={padding}>{children}</Box>
      </Paper>
    </Box>
  );
};

export default PaperCard;
