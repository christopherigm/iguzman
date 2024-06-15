import { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

type RibbonProps = {
  text: string;
  color: string;
  borderColor: string;
  marginTop?: number;
};

const Ribbon = ({
  text,
  color,
  borderColor,
  marginTop = 0.8,
}: RibbonProps): ReactElement => {
  const verticalPadding = 0.2;
  const horizontalPadding = 1;
  const borderRadius = 5;

  return (
    <Box
      paddingTop={verticalPadding}
      paddingRight={horizontalPadding}
      paddingBottom={verticalPadding}
      paddingLeft={horizontalPadding}
      borderRadius={`${borderRadius}px 0 0 ${borderRadius}px`}
      marginTop={marginTop}
      border={`solid 2px ${borderColor}`}
      sx={{
        backgroundColor: color,
      }}
    >
      <Typography variant="body2" color="white">
        {text}
      </Typography>
    </Box>
  );
};

export default Ribbon;
