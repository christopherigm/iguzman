import type { CSSProperties, ReactNode } from 'react';
import './tv-badge.css';

/**
 * Visual variant of the badge.
 * - `filled`   - solid background (default)
 * - `outlined` - transparent background with a colored border
 * - `subtle`   - translucent neutral wash that reads on a dark backdrop
 */
export type TvBadgeVariant = 'filled' | 'outlined' | 'subtle';

/** Size preset for the badge (scaled up for 10-foot legibility). */
export type TvBadgeSize = 'sm' | 'md' | 'lg';

export interface TvBadgeProps {
  /** Text content displayed inside the badge. */
  children: ReactNode;
  /** Visual variant. @default 'filled' */
  variant?: TvBadgeVariant;
  /** Size preset. @default 'md' */
  size?: TvBadgeSize;
  /** Background / accent color override (CSS value). */
  color?: string;
  /** Foreground text color override (CSS value). Only used with `filled`. */
  textColor?: string;
  /** Extra CSS class names. */
  className?: string;
  /** Inline style overrides. */
  style?: CSSProperties;
}

/**
 * 10-foot adaptation of `@repo/ui`'s `Badge` for Smart TV apps.
 *
 * Sizing is bumped up for the couch viewing distance, and the `subtle` variant
 * uses a plain `rgba()` wash instead of the web badge's `color-mix()` (which
 * Tizen 6.x / old Chromium does not support and would drop, leaving an
 * unreadable transparent pill). Otherwise mirrors the web API.
 */
export function TvBadge({
  children,
  variant = 'filled',
  size = 'md',
  color,
  textColor,
  className,
  style,
}: TvBadgeProps) {
  const cssVars: Record<string, string> = {};
  if (color) cssVars['--tv-badge-bg'] = color;
  if (textColor) cssVars['--tv-badge-fg'] = textColor;

  const cls = ['tv-badge', `tv-badge--${variant}`, `tv-badge--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} style={{ ...cssVars, ...style }}>
      {children}
    </span>
  );
}
