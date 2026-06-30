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
 * Flex *container* props. When any of these is set but `display` is not,
 * Box infers `display: "flex"` so the prop actually takes effect. Flex
 * *child* props (`flex`, `flexGrow`, `alignSelf`, `order`) are intentionally
 * excluded - they style the Box as a child of some other flex container and
 * must not turn the Box itself into a flex container.
 */
const FLEX_CONTAINER_KEYS: (keyof BoxProps)[] = [
  "flexDirection",
  "justifyContent",
  "alignItems",
  "flexWrap",
  "gap",
];

/**
 * Box - a small, flexible div wrapper that accepts inline layout props.
 *
 * Setting any flex container prop (`flexDirection`, `justifyContent`,
 * `alignItems`, `flexWrap`, `gap`) automatically applies `display: "flex"`
 * unless `display` is set explicitly (e.g. `display="grid"` / `"block"`).
 *
 * @example
 * <Box
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
export const Box = React.forwardRef<HTMLDivElement, BoxProps>(function Box(
  props,
  ref,
) {
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

  const built = buildStyleProps(props);
  // Infer flex display so flex container props aren't silently inert on a
  // default `display: block` div. Explicit `display` always wins.
  if (
    built.display === undefined &&
    FLEX_CONTAINER_KEYS.some((key) => props[key] !== undefined)
  ) {
    built.display = "flex";
  }

  const style: CSSProperties = {
    ...built,
    // Same backdrop blur as the translucent Navbar / Badge. The
    // translucent/tinted background lets the blur read through.
    ...(translucent
      ? { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }
      : {}),
    ...styles,
  };

  return (
    <div
      ref={ref}
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
});

export default Box;
