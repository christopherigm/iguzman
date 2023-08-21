import {ReactElement, useEffect, useState} from 'react';
import Image from 'next/image';
import Box from '@mui/material/Box';

interface ImageProps {
  src: string;
  alt: string;
  xs?: number;
  sm?: number;
  md?: number;
  quality?: number;
};

const GenericImage = ({
    xs=350,
    sm=450,
    md=350,
    src,
    alt,
    quality=75,
  }: ImageProps): ReactElement => {
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(()=> {
    console.log('renders');
  })

  return (
    <Box
      className={loading ?
        'GenericImage GenericImage__loading' :
        'GenericImage'}
      position='relative'
      width='100%'
      height='100%'
      sx={{
        backgroundImage: 'url(/images/temp.jpg)',
        minHeight: {
          xs: `${xs}px`,
          sm: `${sm}px`,
          md: `${md}px`
        },
      }}>
      <Image
        loading='lazy'
        priority={false}
        src={src}
        fill={true}
        style={{
          opacity: loading ? 0 : 1
        }}
        alt={alt}
        onLoad={() => setLoading(false)}
        sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
        quality={quality} />
    </Box>
  )
};

export default GenericImage;

// https://youtu.be/hJ7Rg1821Q0
