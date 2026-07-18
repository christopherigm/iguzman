import React, { CSSProperties } from "react";
import "./badge.css";

/**
 * Visual variant of the badge.
 * - `filled`   - solid background (default)
 * - `outlined` - transparent background with border
 * - `subtle`   - translucent tinted background
 */
export type BadgeVariant = "filled" | "outlined" | "subtle";

/**
 * Size preset for the badge.
 */
export type BadgeSize = "sm" | "md" | "lg";

/**
 * Props for the `Badge` component.
 */
export interface BadgeProps {
  /** Text content displayed inside the badge. */
  children: React.ReactNode;
  /** Visual variant. @default 'filled' */
  variant?: BadgeVariant;
  /** Size preset. @default 'md' */
  size?: BadgeSize;
  /** Background / accent color override (CSS value). */
  color?: string;
  /** Foreground text color override (CSS value). Only used with `filled` variant. */
  textColor?: string;
  /** Renders the label in uppercase. @default false */
  uppercase?: boolean;
  /**
   * When `true`, applies `backdrop-filter: blur(8px)` so the badge blends into a
   * translucent surface (e.g. floating over an image). Off by default -
   * backdrop-filter is expensive to composite, so it is opt-in.
   * @default false
   */
  translucent?: boolean;
  /** Extra CSS class names. */
  className?: string;
  /** Inline style overrides. */
  style?: CSSProperties;
}

/**
 * Badge - a small labelling component for statuses, tags, and metadata.
 *
 * @example
 * <Badge>New</Badge>
 * @example
 * <Badge variant="outlined" color="#ef4444">H265</Badge>
 * @example
 * <Badge variant="subtle" size="sm" color="#8b5cf6">Beta</Badge>
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "filled",
  size = "md",
  color,
  textColor,
  uppercase = false,
  translucent = false,
  className,
  style,
}) => {
  const cssVars: Record<string, string> = {};
  if (color) cssVars["--badge-bg"] = color;
  if (textColor) cssVars["--badge-fg"] = textColor;

  const classes = [
    "ui-badge",
    `ui-badge--${variant}`,
    `ui-badge--${size}`,
    uppercase && "ui-badge--uppercase",
    translucent && "ui-badge--translucent",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      style={{
        ...cssVars,
        ...style,
      }}
    >
      {children}
    </span>
  );
};

export default Badge;
