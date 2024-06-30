import { ReactElement } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';

type Props = {
  children: any;
  marginTop?: number;
  marginBottom?: number;
  elevation?: number;
  padding?: number;
  overflow?: 'visible' | 'hidden' | 'clip' | 'scroll' | 'auto';
  width?: string | number;
};

const PaperCard = ({
  children,
  elevation = 1,
  marginTop = 0,
  marginBottom = 0,
  padding = 1.5,
  overflow = 'hidden',
  width = '100%',
}: Props): ReactElement => {
  return (
    <Box width={width} marginTop={marginTop} marginBottom={marginBottom}>
      <Paper elevation={elevation} sx={{ overflow }}>
        <Box padding={padding}>{children}</Box>
      </Paper>
    </Box>
  );
};

export default PaperCard;
