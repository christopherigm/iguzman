import Box from '@mui/material/Box';
import { ReactElement } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';

type LogoItemProps = {
  image: string;
  width: number | string;
  height: number | string;
  backgroundSize?: 'contain' | 'cover' | string;
  borderRadius?: number;
  padding?: number;
  resize?: boolean;
  darkMode: boolean;
};

const LogoItem = ({
  image,
  width,
  height,
  darkMode,
  backgroundSize = 'contain',
  borderRadius = 2,
  padding = 0,
  resize = true,
}: LogoItemProps): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean =
    useMediaQuery(theme.breakpoints.only('xs')) && resize;
  const w = typeof width === 'number' ? width - (padding * 4 ?? 0) : width;
  const h = typeof height === 'number' ? height - (padding * 15 ?? 0) : height;
  const transitionDuration = '0.4s';
  const transitionTimingFunction = 'ease';

  return (
    <Box
      borderRadius={borderRadius}
      padding={padding}
      width={width}
      height={height}
      marginTop={
        isXSSize ? `-${(typeof height === 'number' ? height : 70) / 1.5}px` : 0
      }
      marginBottom={isXSSize ? 2 : 0}
      bgcolor={isXSSize || darkMode ? 'white' : ''}
      sx={{
        transition: 'height, width',
        transitionDuration: transitionDuration,
        transitionTimingFunction: transitionTimingFunction,
      }}
    >
      <Box
        width={w}
        height={h}
        bgcolor={(isXSSize || darkMode) && !padding ? 'white' : ''}
        boxShadow={
          (isXSSize || darkMode) && !padding
            ? '1px 1px 3px rgba(0,0,0,0.2)'
            : 'none'
        }
        sx={{
          backgroundSize: backgroundSize,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundImage: `url(${image})`,
          transition: 'height, width',
          transitionDuration: transitionDuration,
          transitionTimingFunction: transitionTimingFunction,
        }}
        borderRadius={borderRadius}
      />
    </Box>
  );
};

export default LogoItem;
