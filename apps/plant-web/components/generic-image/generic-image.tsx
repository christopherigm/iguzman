import {ReactElement} from 'react';
import Image from 'next/image';
import Box from '@mui/material/Box';

interface ImageProps {
  src: string;
  alt: string;
}

const GenericImage = ({src, alt}: ImageProps): ReactElement => {
  return (
    <Box
      position={'relative'}
      width={'100%'}
      height={'100%'}
      sx={{
        minHeight: {
          xs: '350px',
          sm: '450px',
          md: '350px'
        },
      }}>
      <Image
        priority={false}
        src={src}
        fill={true}
        style={{
          objectFit: 'cover'
        }}
        alt={alt}
        sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
        quality={75} />
    </Box>
  )
};

export default GenericImage;
