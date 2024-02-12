import { ReactElement, ReactNode } from 'react';
import Box from '@mui/material/Box';
import User from 'classes/user';

type BadgeProps = {
  children: ReactNode;
};

const Badge = ({ children }: BadgeProps): ReactElement => {
  return (
    <Box
      marginLeft={1}
      paddingLeft={1}
      borderLeft="solid 1px #777"
      color="white"
    >
      {children}
    </Box>
  );
};

export default Badge;
