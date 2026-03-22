import React, { CSSProperties } from 'react';
import { UIComponentProps, buildStyleProps } from './utils';
import './typography.css';

export type TypographyVariant =
  | 'none'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'body'
  | 'body-sm'
  | 'caption'
  | 'label';

type TypographyElement =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'p'
  | 'span'
  | 'label'
  | 'div';

/**
 * Props for the `Typography` component.
 */
export interface TypographyProps extends UIComponentProps {
  /**
   * Visual + typographic variant. Controls CSS scale and defaults the rendered
   * HTML element. Use `'none'` to skip all variant CSS and rely on a `className`
   * for typography (avoids specificity conflicts with existing CSS classes).
   */
  variant?: TypographyVariant;
  /** Override the rendered HTML element while keeping the variant's visual style. */
  as?: TypographyElement;
  /** Horizontal text alignment. */
  textAlign?: CSSProperties['textAlign'];
  /** Font-weight override (takes precedence over variant's default weight). */
  fontWeight?: CSSProperties['fontWeight'];
  /** ARIA role, e.g. `"alert"` for error messages. */
  role?: string;
  /** Marks the element as the current item in a set (e.g. `"page"` for breadcrumbs). */
  'aria-current'?: React.AriaAttributes['aria-current'];
  /** Hides element from assistive technology when `true` or `"true"`. */
  'aria-hidden'?: React.AriaAttributes['aria-hidden'];
  /** Accessible label when visible text is absent or insufficient. */
  'aria-label'?: string;
}

const VARIANT_ELEMENT: Record<TypographyVariant, TypographyElement> = {
  none: 'p',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  body: 'p',
  'body-sm': 'p',
  caption: 'p',
  label: 'span',
};

/**
 * Typography — semantic text component covering headings, body, captions, and labels.
 *
 * - `variant` controls the visual scale and defaults the rendered HTML element.
 * - `as` overrides the HTML element while keeping the variant's styles.
 * - `variant="none"` skips variant CSS — useful when a CSS class already handles
 *   all typography for an element (avoids cascade conflicts).
 * - Accepts all `UIComponentProps` for layout integration (margin, color, width, …).
 *
 * @example
 * <Typography variant="h1">Hello World</Typography>
 * @example
 * <Typography variant="body-sm" color="var(--muted-foreground)">Subtitle</Typography>
 * @example
 * <Typography as="h1" variant="h2" fontWeight={600}>Page Title</Typography>
 * @example
 * <Typography as="h3" variant="none" className="story-card__name" color="#fff">Card</Typography>
 */
export const Typography: React.FC<TypographyProps> = ({
  variant = 'body',
  as,
  textAlign,
  fontWeight,
  role,
  children,
  className,
  id,
  styles,
  'aria-current': ariaCurrent,
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
  ...rest
}) => {
  const Tag = (as ??
    VARIANT_ELEMENT[variant]) as React.ElementType<React.HTMLAttributes<HTMLElement>>;

  const uiStyle = buildStyleProps(rest as UIComponentProps);

  const finalStyle: CSSProperties = {
    ...uiStyle,
    ...(textAlign !== undefined ? { textAlign } : {}),
    ...(fontWeight !== undefined ? { fontWeight } : {}),
    ...styles,
  };

  const classes = [
    'ui-typography',
    variant !== 'none' && `ui-typography--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag
      id={id}
      role={role}
      className={classes}
      style={Object.keys(finalStyle).length > 0 ? finalStyle : undefined}
      aria-current={ariaCurrent}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
    >
      {children}
    </Tag>
  );
};

export default Typography;
