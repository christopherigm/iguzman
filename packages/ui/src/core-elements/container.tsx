import React, { CSSProperties, memo } from 'react';
import {
  UIComponentProps,
  createSafeStyle,
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
export const Container: React.FC<ContainerProps> = memo((props) => {
  const {
    size = 'lg',
    paddingX,
    styles,
    children,
    display,
    flexDirection,
    justifyContent,
    alignItems,
    flexWrap,
    gap,
    flex,
    alignSelf,
    order,
    width,
    height,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    padding,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginInlineStart,
    marginInlineEnd,
    border,
    borderRadius,
    color,
    backgroundColor,
    shadow,
    elevation,
    className,
    id,
    ...rest
  } = props;

  const safeStyle: CSSProperties = createSafeStyle(props);

  const containerStyle: CSSProperties = {
    ...safeStyle,
    width: '100%',
    maxWidth: BREAKPOINTS[size],
    marginLeft: 'auto',
    marginRight: 'auto',
    ...(paddingX !== undefined && {
      paddingLeft: paddingX,
      paddingRight: paddingX,
    }),
    ...(styles ?? {}),
  };

  return (
    <div
      id={id}
      className={className}
      style={containerStyle}
      {...(rest as any)}
    >
      {children}
    </div>
  );
});

export default Container;
