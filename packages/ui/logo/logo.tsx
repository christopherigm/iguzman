import Image from 'next/image';

// https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit
type ObjectFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

const defaultWidth = '200px';
const defaultHeight = '45px';

interface Props {
  devMode?: boolean;
  logo: string;
  fullWidth?: boolean;
  height?: string;
  width?: string;
  objectFit?: ObjectFit;
  alt?: string;
}

const Logo = ({
  devMode,
  logo,
  fullWidth,
  height,
  width,
  objectFit,
  alt
  }: Props) => {

  return (
    <div
      className={devMode ? 'Logo DevMode' : 'Logo'}
      style={{
        position: 'relative',
        width: fullWidth ? '100%' :
          width ? width : defaultWidth,
        height: height ? height : defaultHeight,
      }}>
      <Image
        src={logo}
        alt={alt ? alt : 'Logo'}
        fill={true}
        style={{
          objectFit: objectFit ? objectFit : 'contain'
        }}
        className={devMode ? 'DevMode' : ''}
        sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
        quality={60}
        priority={true} />
    </div>
  )
}

export default Logo;
