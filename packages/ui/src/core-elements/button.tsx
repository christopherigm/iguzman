'use client';

import React from 'react';
import Link from 'next/link';
import { CSSProperties } from 'react';
import { UIComponentProps, buildStyleProps, getBoxShadow } from './utils';
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
 * @example
 * <Button text="Save" onClick={() => save()} elevation={2} />
 * @example
 * <Button text="Go to docs" href="/docs" />
 */
export const Button: React.FC<ButtonProps> = (props) => {
  const { text, type = 'button', href, onClick, className, id } = props;
  const [isHovered, setIsHovered] = React.useState(false);

  if (text === undefined || text === null) {
    return null;
  }

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

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (typeof props.onHover === 'function') props.onHover(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (typeof props.onHover === 'function') props.onHover(false);
  };

  const finalStyle: CSSProperties = {
    ...defaultStyle,
    ...buildStyleProps(props as UIComponentProps),
    ...props.styles,
    boxShadow: getBoxShadow(isHovered ? 5 : 0) ?? 'none',
    position: 'relative',
    overflow: 'hidden',
  };

  const shouldUseLink = href !== undefined && onClick === undefined;

  if (shouldUseLink) {
    const hrefString = href instanceof URL ? href.toString() : String(href);
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
