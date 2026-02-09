import Image from 'next/image';
import { MUISizes } from '@iguzman/helpers/types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
// import { useEffect, useState } from 'react';

/**
 * Object fit types for image styling
 */
export type ObjectFit = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';

/**
 * Generic image component props
 */
export type GenericImageProps = {
  /**
   * Unique identifier for the image
   */
  id?: number;
  /**
   * UUID for the image
   */
  uuid?: string;
  /**
   * Image source URL
   */
  imgPicture?: string;
  /**
   * Background image URL
   */
  imgBackground?: string;
  /**
   * Image name/title
   */
  name?: string;
  /**
   * Link URL for the image
   */
  href?: string;
  /**
   * Image object fit property
   */
  fit?: ObjectFit;
  /**
   * Background color for the container
   */
  backgroundColor?: string;
  /**
   * Raw item data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawItem?: any;
};

/**
 * Image component configuration props
 */
type ImageConfigProps = {
  /**
   * Image quality (50, 70, 90, 100)
   * @default 90
   */
  quality?: 50 | 70 | 90 | 100;
  /**
   * Image sizes attribute for responsive images
   * @default "(max-width: 768px) 100vw, (max-width: 2048px) 50vw, 33vw"
   */
  sizes?: string;
  /**
   * Image width
   * @default { xs: '100%' }
   */
  width?: MUISizes;
  /**
   * Image height
   * @default { xs: 350, sm: 450, md: 350 }
   */
  height?: MUISizes;
  /**
   * Maximum height for the image container
   */
  maxHeight?: string;
  /**
   * Blur overlay intensity (0-20px)
   */
  blurOverlay?: number;
  /**
   * Image object fit property
   * @default 'cover'
   */
  fit?: ObjectFit;
  /**
   * Background color for the container
   * @default ''
   */
  backgroundColor?: string;
  /**
   * Border radius for the container
   * @default 0
   */
  borderRadius?: number;
  /**
   * Box shadow for the container
   * @default ''
   */
  boxShadow?: string;
  /**
   * Image loading strategy
   * @default 'lazy'
   */
  imgLoading?: 'eager' | 'lazy';
  /**
   * Name position from bottom
   * @default 0
   */
  nameBottom?: number;
  /**
   * Name text alignment
   * @default 'center'
   */
  namePosition?: 'center' | 'left' | 'right';
  /**
   * Image opacity
   * @default 1
   */
  opacity?: number;
  /**
   * Whether to use unoptimized images
   * @default false
   */
  unoptimized?: boolean;
  /**
   * Overflow behavior
   * @default 'hidden'
   */
  overflow?: string;
  /**
   * CSS class name
   * @default ''
   */
  className?: string;
} & GenericImageProps;

/**
 * Generic image component that renders an image with optional overlay text and blur effect
 *
 * @example
 * ```tsx
 * <GenericImage
 *   imgPicture="/path/to/image.jpg"
 *   name="Image Title"
 *   fit="cover"
 *   blurOverlay={5}
 * />
 * ```
 *
 * @param props - Component props
 * @returns React component
 */
const GenericImage = ({
  quality = 90,
  sizes = '(max-width: 768px) 100vw, (max-width: 2048px) 50vw, 33vw',
  width = {
    xs: '100%',
  },
  height = {
    xs: 350,
    sm: 450,
    md: 350,
  },
  maxHeight,
  imgPicture,
  name,
  blurOverlay = 0,
  fit = 'cover',
  backgroundColor = '',
  borderRadius = 0,
  boxShadow = '',
  imgLoading = 'lazy',
  nameBottom = 0,
  namePosition = 'center',
  opacity = 1,
  unoptimized = false,
  overflow = 'hidden',
  className = '',
}: ImageConfigProps) => {
  // const [isLoaded, setIsLoaded] = useState(false);

  // useEffect(() => {
  //   setIsLoaded(false);
  // }, [imgPicture]);

  // Check if image source is provided
  if (!imgPicture) {
    console.warn('GenericImage: imgPicture is required but not provided');
    return null;
  }

  return (
    <Box
      className={className}
      position="relative"
      width={width}
      height={height}
      maxHeight={maxHeight}
      bgcolor={backgroundColor}
      borderRadius={borderRadius}
      overflow={overflow}
      boxShadow={boxShadow}
    >
      {/* {!isLoaded && <>Is loading....</>} */}
      <Image
        loading={imgLoading}
        src={imgPicture}
        fill={true}
        style={{
          opacity: opacity ?? 1,
          objectFit: fit,
        }}
        alt={name || ''}
        quality={quality ?? 90}
        sizes={sizes}
        unoptimized={unoptimized}
        // onLoadingComplete={() => setIsLoaded(true)}
      />
      {blurOverlay ? (
        <Box
          width="100%"
          height="100%"
          top={0}
          left={0}
          position="absolute"
          sx={{
            backdropFilter: `blur(${blurOverlay}px)`,
          }}
        ></Box>
      ) : null}
      {name ? (
        <Box
          width="100%"
          height="auto"
          bottom={nameBottom}
          left={0}
          position="absolute"
          padding={1}
          bgcolor="rgba(0,0,0,0.4)"
        >
          <Typography variant="body1" color="#fff" textAlign={namePosition}>
            {name}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
};

export default GenericImage;
