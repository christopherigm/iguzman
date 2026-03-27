import React, { CSSProperties } from 'react';
import { UIComponentProps, buildStyleProps } from './utils';

export interface BoxProps extends UIComponentProps {
  /** ARIA role for semantic meaning (e.g. `"nav"`, `"main"`, `"article"`). */
  role?: string;
  /** Accessible label for the element when visible text is absent. */
  'aria-label'?: string;
  /** Hides element from assistive technology when `true` or `"true"`. */
  'aria-hidden'?: React.AriaAttributes['aria-hidden'];
  /** ID of another element that labels this one. */
  'aria-labelledby'?: string;
  /** ID of another element that describes this one. */
  'aria-describedby'?: string;
  /** Whether this element is a modal dialog. */
  'aria-modal'?: boolean;
  /** Click handler. */
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  /** Animation end handler. */
  onAnimationEnd?: React.AnimationEventHandler<HTMLDivElement>;
}

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
export const Box: React.FC<BoxProps> = (props) => {
  const { styles, children, className, id, role, onClick, onAnimationEnd } = props;

  const style: CSSProperties = { ...buildStyleProps(props), ...styles };

  return (
    <div
      id={id}
      className={className}
      style={style}
      role={role}
      aria-label={props['aria-label']}
      aria-hidden={props['aria-hidden']}
      aria-labelledby={props['aria-labelledby']}
      aria-describedby={props['aria-describedby']}
      aria-modal={props['aria-modal']}
      onClick={onClick}
      onAnimationEnd={onAnimationEnd}
    >
      {children}
    </div>
  );
};

export default Box;
