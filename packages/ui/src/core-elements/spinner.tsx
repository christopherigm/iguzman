'use client';

import { CSSProperties } from 'react';
import { UIComponentProps, buildStyleProps } from './utils';
import './spinner.css';

export interface SpinnerProps extends UIComponentProps {
  /** Diameter in pixels. @defaultValue 20 */
  size?: number;
  /** Border (track) thickness in pixels. @defaultValue 2 */
  thickness?: number;
  /** Accessible label. @defaultValue "Loading" */
  label?: string;
}

export const Spinner = ({
  size = 20,
  thickness = 2,
  label = 'Loading',
  className,
  id,
  ...rest
}: SpinnerProps) => {
  const uiStyle: CSSProperties = buildStyleProps(rest as UIComponentProps);

  const rootClasses = ['spinner', className].filter(Boolean).join(' ');

  return (
    <span
      id={id}
      className={rootClasses}
      role="status"
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderWidth: thickness,
        ...uiStyle,
      }}
    />
  );
};

export default Spinner;
