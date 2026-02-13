import React from 'react';
import type { UIComponentProps } from './utils';
import { createSafeStyle } from './utils';

export type BackgroundShape = 'circle' | 'square' | 'triangle' | '';

/**
 *
 * More Icons: https://www.svgrepo.com/
 */

export interface IconProps extends UIComponentProps {
  icon: string; // required - path to SVG file
  color?: string; // fill color for the SVG mask
  size?: string | number; // CSS size (e.g. "24px", "1.5rem")
  padding?: string | number; // CSS size (e.g. "24px", "1.5rem")
  backgroundColor?: string; // optional background color
  backgroundShape?: BackgroundShape; // optional background shape
  shadow?: boolean; // optional drop-shadow for the background
}

export const Icon = ({
  icon,
  color = 'var(--accent, #06b6d4)',
  size = '24px',
  padding = 0,
  backgroundColor = '',
  backgroundShape = '',
  shadow = false,
  className,
  ...props
}: IconProps) => {
  const outerRadius =
    backgroundShape === 'circle' ? '50%' : backgroundShape === 'square' ? 6 : 0;

  const triangleClip =
    backgroundShape === 'triangle'
      ? 'polygon(50% 6%, 94% 88%, 6% 88%)'
      : undefined;

  // Use createSafeStyle to build a defensive base style from UI props,
  // then merge in shape-specific helpers and the `style` override.
  const safeBase = createSafeStyle({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    padding,
    backgroundColor: backgroundColor || 'transparent',
    borderRadius: outerRadius,
    shadow,
    ...props,
  } as UIComponentProps);

  const outerStyle: React.CSSProperties = {
    ...safeBase,
    clipPath: triangleClip,
    boxSizing: 'border-box',
    filter: shadow ? 'drop-shadow(0 6px 10px rgba(0,0,0,0.12))' : undefined,
  };

  const maskStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    // color applied through background; SVG used as mask
    backgroundColor: color,
    WebkitMaskImage: `url(${icon})`,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskImage: `url(${icon})`,
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: 'contain',
    // ensure the masked element doesn't inherit outer background
    // (so when backgroundColor is provided, it sits behind the mask)
  };

  return (
    <span className={className} style={outerStyle} aria-hidden>
      <span style={maskStyle} />
    </span>
  );
};

export default Icon;
