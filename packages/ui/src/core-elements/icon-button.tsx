"use client";

import React from "react";
import Link from "next/link";
import { CSSProperties } from "react";
import { UIComponentProps, buildStyleProps } from "./utils";
import { Icon } from "./icon";
import { Spinner } from "./spinner";
import "./icon-button.css";

/** Allowed HTML button types. */
export type IconButtonType = "button" | "submit" | "reset";

/** Standardized icon-button size tokens (square box dimensions). */
export type IconButtonSize = "sm" | "md" | "lg";

/** Semantic color intent for an icon button. */
export type IconButtonKind =
  | "default"
  | "primary"
  | "error"
  | "success"
  | "warning";

/** Square box size and border-radius per size token. */
const BOX_STYLES: Record<
  IconButtonSize,
  Pick<CSSProperties, "width" | "height" | "borderRadius">
> = {
  sm: { width: 28, height: 28, borderRadius: 6 },
  md: { width: 36, height: 36, borderRadius: 8 },
  lg: { width: 44, height: 44, borderRadius: 10 },
};

const ICON_SIZES: Record<IconButtonSize, number> = {
  sm: 16,
  md: 18,
  lg: 20,
};

const SPINNER_SIZES: Record<IconButtonSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
};

/** Icon color per semantic kind. Drives the masked icon fill. */
const KIND_ICON_COLORS: Record<IconButtonKind, string> = {
  default: "var(--muted-foreground, #6b7280)",
  primary: "var(--accent, #06b6d4)",
  error: "var(--error, #ef4444)",
  success: "var(--success, #16a34a)",
  warning: "var(--warning, #d97706)",
};

/**
 * Subtle tinted background per semantic kind. Always present so the button
 * shape is discoverable even at rest. Mixed at a low percentage with
 * transparent so it reads as a faint tint over any surface.
 */
const KIND_BACKGROUNDS: Record<IconButtonKind, string> = {
  default: "color-mix(in srgb, var(--foreground, #111) 7%, transparent)",
  primary: "color-mix(in srgb, var(--accent, #06b6d4) 16%, transparent)",
  error: "color-mix(in srgb, var(--error, #ef4444) 12%, transparent)",
  success: "color-mix(in srgb, var(--success, #16a34a) 12%, transparent)",
  warning: "color-mix(in srgb, var(--warning, #d97706) 12%, transparent)",
};

/**
 * Fully opaque background per semantic kind. Used when `solid` is set so the
 * button reads as a filled, high-emphasis control instead of a faint tint.
 */
const KIND_SOLID_BACKGROUNDS: Record<IconButtonKind, string> = {
  default: "var(--foreground, #111)",
  primary: "var(--accent, #06b6d4)",
  error: "var(--error, #ef4444)",
  success: "var(--success, #16a34a)",
  warning: "var(--warning, #d97706)",
};

/**
 * Subtle border per semantic kind, tinted from the same color that drives the
 * icon. Mixed at a low percentage so it reads as a faint, lighter outline that
 * defines the button's edge without competing with the icon.
 */
const KIND_BORDERS: Record<IconButtonKind, string> = {
  default: "color-mix(in srgb, var(--foreground, #111) 14%, transparent)",
  primary: "color-mix(in srgb, var(--accent, #06b6d4) 32%, transparent)",
  error: "color-mix(in srgb, var(--error, #ef4444) 28%, transparent)",
  success: "color-mix(in srgb, var(--success, #16a34a) 28%, transparent)",
  warning: "color-mix(in srgb, var(--warning, #d97706) 28%, transparent)",
};

/**
 * Border per semantic kind for `solid` buttons. The fill is already the opaque
 * kind color, so the rim is the kind color lightened toward white to read as a
 * subtle highlight edge rather than a darker outline.
 */
const KIND_SOLID_BORDERS: Record<IconButtonKind, string> = {
  default: "color-mix(in srgb, var(--foreground, #111) 70%, #fff)",
  primary: "color-mix(in srgb, var(--accent, #06b6d4) 65%, #fff)",
  error: "color-mix(in srgb, var(--error, #ef4444) 65%, #fff)",
  success: "color-mix(in srgb, var(--success, #16a34a) 65%, #fff)",
  warning: "color-mix(in srgb, var(--warning, #d97706) 65%, #fff)",
};

/**
 * Props for `IconButton` component.
 */
export interface IconButtonProps extends UIComponentProps {
  /** SVG path passed to the internal Icon component. Required. */
  icon: string;
  /**
   * Accessible label. Required because icon-only buttons have no visible text.
   */
  "aria-label": string;
  /** HTML button `type`. Defaults to `button`. */
  type?: IconButtonType;
  /**
   * Navigation target. If provided and no `onClick` is given, the component
   * renders a `next/Link` (prefetch enabled) instead of a native `button`.
   */
  href?: string | URL;
  /**
   * Anchor `target` (e.g. `"_blank"`). Applied to the rendered `next/Link`
   * when `href` is used. `"_blank"` automatically gets `rel="noopener noreferrer"`.
   */
  target?: React.HTMLAttributeAnchorTarget;
  /** Click handler. If provided, it takes precedence over `href`. */
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>,
  ) => void;
  /** Controls box dimensions and auto-derived icon size. Defaults to `'md'`. */
  size?: IconButtonSize;
  /** Semantic color intent. Drives icon color and hover tint. Defaults to `'default'`. */
  kind?: IconButtonKind;
  /** Overrides the auto-derived icon size (sm→16px, md→18px, lg→20px). */
  iconSize?: string | number;
  /** Overrides the icon color. Defaults to the color for `kind`. */
  iconColor?: string;
  /**
   * When `true`, the inner `Icon` renders the SVG as a real multi-color image
   * (preserving its own colors) instead of a single-color mask. Defaults to
   * `false`. Use for multi-color art/badges that must keep their own colors.
   */
  fullColor?: boolean;
  /** Disables the button and suppresses interaction. */
  disabled?: boolean;
  /** HTML `title` attribute (tooltip shown on hover). */
  title?: string;
  /** Shows a loading spinner and disables the button while true. */
  isLoading?: boolean;
  /**
   * When `true`, applies a `backdrop-filter: blur(8px)` so the button blends
   * into a translucent surface (e.g. inside a translucent Navbar). Defaults to
   * `false` — backdrop blur is expensive to composite while scrolling, so it is
   * opt-in and should only be enabled over a genuinely translucent backdrop.
   */
  translucent?: boolean;
  /**
   * When `true`, the button renders with a fully opaque, kind-tinted background
   * (no transparency or blur) and a white icon — giving a high-emphasis,
   * "filled" appearance. Defaults to `false`. The white icon overrides
   * `iconColor`; only `fullColor` (which keeps the SVG's own colors) takes
   * precedence over it. Suppresses `translucent` blur when set.
   */
  solid?: boolean;
  /** Indicates whether a toggle button is currently pressed. */
  "aria-pressed"?: boolean;
  /** Indicates whether a control is expanded or collapsed. */
  "aria-expanded"?: boolean;
  /** IDs of elements whose contents are controlled by this button. */
  "aria-controls"?: string;
}

/**
 * IconButton - square, ghost-styled, icon-only button that optionally becomes a
 * Next.js Link. Transparent by default with a hover tint derived from `kind`.
 *
 * @example
 * <IconButton icon="/icons/delete.svg" kind="error" aria-label="Delete" onClick={remove} />
 * @example
 * <IconButton icon="/icons/external.svg" href={url} target="_blank" aria-label="Open" />
 */
export const IconButton: React.FC<IconButtonProps> = (props) => {
  const {
    icon,
    type = "button",
    href,
    target,
    onClick,
    className,
    id,
    title,
    disabled,
    size = "md",
    kind = "default",
    iconSize,
    iconColor,
    fullColor = false,
    isLoading,
    translucent = false,
    solid = false,
  } = props;

  const ariaLabel = props["aria-label"];
  const ariaPressed = props["aria-pressed"];
  const ariaExpanded = props["aria-expanded"];
  const ariaControls = props["aria-controls"];

  const isDisabled = disabled || isLoading;

  // Solid buttons force a white icon (overriding iconColor) for contrast on the
  // opaque fill — unless fullColor keeps the SVG's own colors. Otherwise an
  // explicit iconColor wins, falling back to the kind's color.
  const resolvedIconColor =
    solid && !fullColor ? "#fff" : iconColor ?? KIND_ICON_COLORS[kind];

  const inner = isLoading ? (
    <Spinner size={SPINNER_SIZES[size]} thickness={2} />
  ) : (
    <Icon
      icon={icon}
      size={iconSize ?? ICON_SIZES[size]}
      color={resolvedIconColor}
      fullColor={fullColor}
    />
  );

  const finalStyle: CSSProperties = {
    ...BOX_STYLES[size],
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    border: `1px solid ${solid ? KIND_SOLID_BORDERS[kind] : KIND_BORDERS[kind]}`,
    backgroundColor: solid ? KIND_SOLID_BACKGROUNDS[kind] : KIND_BACKGROUNDS[kind],
    // Opt-in backdrop blur for translucent surfaces (e.g. inside a translucent
    // Navbar). Off by default: backdrop-filter re-samples the backdrop every
    // frame and is a major scroll-jank source when many buttons are on screen.
    // Suppressed for solid buttons — a fully opaque fill has nothing to blur.
    ...(translucent && !solid
      ? { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }
      : {}),
    cursor: "pointer",
    textDecoration: "none",
    position: "relative",
    overflow: "hidden",
    ...buildStyleProps(props as UIComponentProps),
    ...props.styles,
  };

  const classes = [`ui-icon-button ui-icon-button--${kind}`, className]
    .filter(Boolean)
    .join(" ");

  const showWave = !isDisabled;
  const waveEl = showWave ? (
    <span aria-hidden className="ui-icon-button__wave" />
  ) : null;

  const shouldUseLink = href !== undefined && onClick === undefined;

  if (shouldUseLink) {
    const hrefString = href instanceof URL ? href.toString() : String(href);
    return (
      <Link
        href={hrefString}
        prefetch
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
        id={id}
        title={title}
        className={classes}
        style={finalStyle}
        aria-label={ariaLabel}
        {...(ariaControls !== undefined
          ? { "aria-controls": ariaControls }
          : {})}
      >
        {waveEl}
        {inner}
      </Link>
    );
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (typeof onClick === "function") onClick(e);
  };

  return (
    <button
      type={type}
      id={id}
      title={title}
      disabled={isDisabled}
      className={classes}
      style={finalStyle}
      onClick={typeof onClick === "function" ? handleClick : undefined}
      aria-label={ariaLabel}
      {...(ariaControls !== undefined ? { "aria-controls": ariaControls } : {})}
      {...(ariaPressed !== undefined ? { "aria-pressed": ariaPressed } : {})}
      {...(ariaExpanded !== undefined ? { "aria-expanded": ariaExpanded } : {})}
    >
      {waveEl}
      {inner}
    </button>
  );
};

export default IconButton;
