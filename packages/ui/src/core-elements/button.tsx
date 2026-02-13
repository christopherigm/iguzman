'use client';

import React from 'react';
import Link from 'next/link';
import { CSSProperties } from 'react';
import { UIComponentProps, createSafeStyle, getBoxShadow } from './utils';
import './button.css';

/**
 * Allowed HTML button types.
 */
export type ButtonType = 'button' | 'submit' | 'reset';

/**
 * Props for `Button` component.
 */
export interface ButtonProps extends UIComponentProps {
  /** Visible label for the button (required). */
  text: string;
  /** HTML button `type`. Defaults to `button`. */
  type?: ButtonType;
  /** Navigation target. If provided and no `onClick` is given, the component
   * renders a `next/Link` (prefetch enabled) instead of a native `button`.
   */
  href?: string | URL;
  /** Click handler. If provided, it takes precedence over `href` and Link is not used. */
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>,
  ) => void;
  /** Called when hover state changes: `true` on enter, `false` on leave. */
  onHover?: (hovered: boolean) => void;
}

/**
 * Button — simple, accessible button that optionally becomes a Next.js Link.
 *
 * Behaviour summary:
 * - If `onClick` exists, it's used and `href` is ignored.
 * - Else if `href` exists, the component renders a prefetching `Link`.
 * - Uses `UIComponentProps` -> `createSafeStyle` for defensive inline styles.
 *
 * @example
 * <Button text="Save" onClick={() => save()} elevation={2} />
 * @example
 * <Button text="Go to docs" href="/docs" />
 */
export const Button: React.FC<ButtonProps> = (props) => {
  const { text, type = 'button', href, onClick, className, id } = props;

  if (text === undefined || text === null) {
    // Defensive guard for required value
    // Do not throw — keep render resilient but warn the developer.
    // eslint-disable-next-line no-console
    console.warn('Button: `text` prop is required but was not provided.');
  }

  // Compute styles defensively and allow `styles` override from props.
  const defaultStyle: CSSProperties = {
    padding: '6px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    backgroundColor: 'var(--accent, #06b6d4)',
    color: 'var(--accent-foreground, #171717)',
    transition:
      'background 150ms ease, color 150ms ease, box-shadow 450ms ease',
  };

  const computed = createSafeStyle(props as UIComponentProps) as CSSProperties;
  const mergedStyle: CSSProperties = { ...defaultStyle, ...(computed || {}) };
  if (props.styles) Object.assign(mergedStyle, props.styles);

  // Hover state to animate elevation (box-shadow) from 0 -> 10
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseEnter = (e: React.MouseEvent) => {
    setIsHovered(true);
    if (typeof props.onHover === 'function') props.onHover(true);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    setIsHovered(false);
    if (typeof props.onHover === 'function') props.onHover(false);
  };

  const elevationValue = isHovered ? 5 : 0;
  const computedBoxShadow = getBoxShadow(elevationValue);
  const finalStyle: CSSProperties = {
    ...mergedStyle,
    boxShadow: computedBoxShadow ?? 'none',
    position: 'relative',
    overflow: 'hidden',
  };

  // If an explicit onClick handler is provided, prefer it and ignore href.
  const shouldUseLink = href !== undefined && onClick === undefined;

  if (shouldUseLink) {
    const hrefString = href instanceof URL ? href.toString() : String(href);
    // Render a semantic link that looks like a button. Avoid nesting a <button>
    // inside an <a> — instead style the anchor to behave as a button.
    return (
      <Link href={hrefString} prefetch>
        <button
          aria-pressed="false"
          id={id}
          className={['ui-button-wave', className].filter(Boolean).join(' ')}
          style={finalStyle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {text}
          <span aria-hidden className="ui-wave" />
        </button>
      </Link>
    );
  }

  // Render a normal button; onClick may be undefined which results in no handler.
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (typeof onClick === 'function') onClick(e as any);
  };

  return (
    <button
      type={type}
      id={id}
      className={['ui-button-wave', className].filter(Boolean).join(' ')}
      style={finalStyle}
      onClick={typeof onClick === 'function' ? handleClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
      <span aria-hidden className="ui-wave" />
    </button>
  );
};

export default Button;
