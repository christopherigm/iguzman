import React, { CSSProperties } from 'react';
import { UIComponentProps, buildStyleProps } from './utils';

/**
 * Box — a small, flexible div wrapper that accepts inline layout props.
 *
 * @example
 * <Box
 *   display="flex"
 *   flexDirection="row"
 *   gap={8}
 *   width="100%"
 *   backgroundColor="#fff"
 *   shadow
 *   elevation={2}
 * >
 *   Content
 * </Box>
 */
export const Box: React.FC<UIComponentProps> = (props) => {
  const { styles, children, className, id } = props;

  const style: CSSProperties = { ...buildStyleProps(props), ...styles };

  return (
    <div id={id} className={className} style={style}>
      {children}
    </div>
  );
};

export default Box;
