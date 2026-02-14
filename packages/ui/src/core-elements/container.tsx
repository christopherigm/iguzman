import React, { CSSProperties } from 'react';
import {
  UIComponentProps,
  buildStyleProps,
  Breakpoint,
  BREAKPOINTS,
} from './utils';

export interface ContainerProps extends UIComponentProps {
  size?: Breakpoint;
  paddingX?: number;
}

/**
 * Container — centers content horizontally with a fixed max-width based on the `size` breakpoint.
 *
 * @example
 * <Container>Hello World!</Container>
 *
 * @example
 * <Container size="md">Hello World!</Container>
 *
 * @example
 * <Container size="lg" paddingX={5}>Hello World!</Container>
 */
export const Container: React.FC<ContainerProps> = (props) => {
  const { size = 'lg', paddingX, styles, children, className, id } = props;

  const containerStyle: CSSProperties = {
    ...buildStyleProps(props),
    width: '100%',
    maxWidth: BREAKPOINTS[size],
    marginLeft: 'auto',
    marginRight: 'auto',
    ...(paddingX !== undefined && {
      paddingLeft: paddingX,
      paddingRight: paddingX,
    }),
    ...styles,
  };

  return (
    <div id={id} className={className} style={containerStyle}>
      {children}
    </div>
  );
};

export default Container;
