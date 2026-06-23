import React, { CSSProperties } from "react";
import { UIComponentProps, buildStyleProps } from "./utils";

export interface BoxProps extends UIComponentProps {
  /** ARIA role for semantic meaning (e.g. `"nav"`, `"main"`, `"article"`). */
  role?: string;
  /** Accessible label for the element when visible text is absent. */
  "aria-label"?: string;
  /** Hides element from assistive technology when `true`. */
  "aria-hidden"?: boolean;
  /** ID of another element that labels this one. */
  "aria-labelledby"?: string;
  /** ID of another element that describes this one. */
  "aria-describedby"?: string;
  /** Whether this element is a modal dialog. */
  "aria-modal"?: boolean;
  /** Tab order for keyboard navigation. */
  tabIndex?: number;
  /** Click handler. */
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  /** Key-down handler. */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  /** Animation end handler. */
  onAnimationEnd?: React.AnimationEventHandler<HTMLDivElement>;
  /** Drag-over handler (call `e.preventDefault()` to allow drop). */
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  /** Drag-enter handler. */
  onDragEnter?: React.DragEventHandler<HTMLDivElement>;
  /** Drag-leave handler. */
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  /** Drop handler. */
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  /** Drag-start handler. */
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  /** Drag-end handler. */
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
  /**
   * Applies a frosted-glass backdrop blur (same effect as `Badge`/translucent
   * `Navbar`). Pair with a translucent/tinted `backgroundColor` so the blur
   * reads through. @default false
   */
  translucent?: boolean;
}

/**
 * Box - a small, flexible div wrapper that accepts inline layout props.
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
  const {
    styles,
    children,
    className,
    id,
    role,
    onClick,
    onKeyDown,
    onAnimationEnd,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    onDragStart,
    onDragEnd,
    tabIndex,
    translucent = false,
  } = props;

  const style: CSSProperties = {
    ...buildStyleProps(props),
    // Same backdrop blur as the translucent Navbar / Badge. The
    // translucent/tinted background lets the blur read through.
    ...(translucent
      ? { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }
      : {}),
    ...styles,
  };

  return (
    <div
      id={id}
      className={className}
      style={style}
      tabIndex={tabIndex}
      aria-label={props["aria-label"]}
      aria-labelledby={props["aria-labelledby"]}
      aria-describedby={props["aria-describedby"]}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onAnimationEnd={onAnimationEnd}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...(role !== undefined ? { role } : {})}
      {...(props["aria-hidden"] !== undefined
        ? { "aria-hidden": props["aria-hidden"] }
        : {})}
      {...(props["aria-modal"] !== undefined
        ? { "aria-modal": props["aria-modal"] }
        : {})}
    >
      {children}
    </div>
  );
};

export default Box;
