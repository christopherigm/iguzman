'use client';

import React from 'react';
import Link from 'next/link';
import { CSSProperties } from 'react';
import { UIComponentProps, buildStyleProps, getBoxShadow } from './utils';
import { Icon } from './icon';
import './button.css';

/**
 * Allowed HTML button types.
 */
export type ButtonType = 'button' | 'submit' | 'reset';

/** Standardized button size tokens. */
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZE_STYLES: Record<ButtonSize, Pick<CSSProperties, 'padding' | 'fontSize' | 'borderRadius'>> = {
  sm: { padding: '6px',        fontSize: 13, borderRadius: 6 },
  md: { padding: '10px 18px',  fontSize: 14, borderRadius: 6 },
  lg: { padding: '12px 24px',  fontSize: 15, borderRadius: 8 },
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: '13px',
  md: '15px',
  lg: '17px',
};

const ICON_GAPS: Record<ButtonSize, string> = {
  sm: '5px',
  md: '6px',
  lg: '8px',
};

/**
 * Props for `Button` component.
 */
export interface ButtonProps extends UIComponentProps {
  /**
   * Visible label for the button. Either `text` or `children` must be provided.
   * When both are given, `children` takes precedence.
   */
  text?: string;
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
  /**
   * When `true`, strips all default Button styles and the wave animation so the
   * element can be fully styled via `className` or `styles`. Use for icon buttons,
   * color swatches, or any toggle button that requires custom visual treatment.
   */
  unstyled?: boolean;
  /** Disables the button and suppresses interaction. */
  disabled?: boolean;
  /** HTML `title` attribute (tooltip shown on hover). */
  title?: string;
  /** Controls padding, font-size, and border-radius. Defaults to `'sm'`. */
  size?: ButtonSize;
  /** SVG path passed to the internal Icon component. */
  icon?: string;
  /** Position of the icon relative to the label. Defaults to `'start'`. */
  iconPosition?: 'start' | 'end';
  /** Overrides the auto-derived icon size (sm→13px, md→15px, lg→17px). */
  iconSize?: string;
  /** Overrides the icon color. Defaults to `currentColor` so it inherits the button's text color. */
  iconColor?: string;
  /** Accessible label when visible text is absent or insufficient (e.g. icon-only buttons). */
  'aria-label'?: string;
  /** Indicates whether a toggle button is currently pressed. */
  'aria-pressed'?: React.AriaAttributes['aria-pressed'];
  /** Indicates whether a control is expanded or collapsed. */
  'aria-expanded'?: React.AriaAttributes['aria-expanded'];
  /** IDs of elements whose contents are controlled by this button. */
  'aria-controls'?: string;
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
  const { text, type = 'button', href, onClick, className, id, unstyled, title, disabled, size = 'sm', icon, iconPosition = 'start', iconSize, iconColor } = props;
  const [isHovered, setIsHovered] = React.useState(false);

  const ariaLabel = props['aria-label'];
  const ariaPressed = props['aria-pressed'];
  const ariaExpanded = props['aria-expanded'];
  const ariaControls = props['aria-controls'];

  const content = props.children ?? text;

  const iconEl = icon ? (
    <Icon
      icon={icon}
      size={iconSize ?? ICON_SIZES[size]}
      color={iconColor ?? 'currentColor'}
    />
  ) : null;

  // Allow content-less buttons (e.g. icon-only) when aria-label provides the accessible name.
  if ((content === undefined || content === null) && !ariaLabel && !icon) {
    return null;
  }

  const hasGap = iconEl && (content !== undefined && content !== null);
  const iconFlexDefaults: CSSProperties = iconEl
    ? { display: 'inline-flex', alignItems: 'center', ...(hasGap ? { gap: ICON_GAPS[size] } : {}) }
    : {};

  const contentWithIcon = iconEl ? (
    <>
      {iconPosition !== 'end' && iconEl}
      {content}
      {iconPosition === 'end' && iconEl}
    </>
  ) : content;

  const defaultStyle: CSSProperties = {
    ...SIZE_STYLES[size],
    ...iconFlexDefaults,
    border: 'none',
    cursor: 'pointer',
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

  const finalStyle: CSSProperties = unstyled
    ? {
        ...iconFlexDefaults,
        ...buildStyleProps(props as UIComponentProps),
        ...props.styles,
      }
    : {
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
          id={id}
          title={title}
          disabled={disabled}
          className={[unstyled ? undefined : 'ui-button-wave', className].filter(Boolean).join(' ')}
          style={finalStyle}
          aria-label={ariaLabel}
          aria-pressed={ariaPressed}
          aria-expanded={ariaExpanded}
          aria-controls={ariaControls}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {contentWithIcon}
          {!unstyled && <span aria-hidden className="ui-wave" />}
        </button>
      </Link>
    );
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (typeof onClick === 'function') onClick(e);
  };

  return (
    <button
      type={type}
      id={id}
      title={title}
      disabled={disabled}
      className={[unstyled ? undefined : 'ui-button-wave', className].filter(Boolean).join(' ')}
      style={finalStyle}
      onClick={typeof onClick === 'function' ? handleClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
    >
      {contentWithIcon}
      {!unstyled && <span aria-hidden className="ui-wave" />}
    </button>
  );
};

export default Button;
