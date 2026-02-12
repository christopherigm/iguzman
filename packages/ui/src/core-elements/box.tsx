import React, { CSSProperties, memo } from 'react';
import { UIComponentProps, createSafeStyle } from './utils';

/**
 * Box — a small, flexible div wrapper that accepts inline layout props and merges styles.
 *
 * JSDoc & example:
 * @example
 * <Box
 *   display="flex"
 *   flexDirection="row"
 *   gap={8}
 *   width="100%"
 *   backgroundColor="#fff"
 *   shadow
 *   elevation={2}
 *   styles={{ borderRadius: 8 }}
 * >
 *   Content
 * </Box>
 */
export const Box: React.FC<UIComponentProps> = memo((props) => {
  const {
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
    styles,
    children,
    className,
    id,
    ...rest
  } = props;

  // Build safe style using shared utility
  const safeStyle: CSSProperties = createSafeStyle(props);

  // Merge: computed styles first, then user-provided `styles` override them.
  const merged: CSSProperties = { ...safeStyle, ...(styles ?? {}) };

  return (
    // Spread `rest` so consumers can pass ARIA or data-* attributes safely.
    <div id={id} className={className} style={merged} {...(rest as any)}>
      {children}
    </div>
  );
});

export default Box;
