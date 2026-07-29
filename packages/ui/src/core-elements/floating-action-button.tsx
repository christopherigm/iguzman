"use client";

import React, { CSSProperties } from "react";
import { Link } from "@repo/i18n/navigation";
import { UIComponentProps, buildStyleProps } from "./utils";
import { Icon } from "./icon";
import { Spinner } from "./spinner";
import { Typography } from "./typography";
import "./floating-action-button.css";

/** Allowed HTML button types. */
export type FabType = "button" | "submit" | "reset";

/** Which screen corner the button is pinned to. */
export type FabPosition = "bottom-right" | "bottom-left";

/** Diameter tokens for the regular (circular) variant. */
export type FabSize = "md" | "lg";

/** Semantic color intent, mirroring `IconButton`'s scale. */
export type FabKind = "primary" | "default" | "error" | "success" | "warning";

/** Circle diameter and icon size per size token. */
const BOX_SIZES: Record<FabSize, { box: number; icon: number }> = {
  md: { box: 36, icon: 16 },
  lg: { box: 42, icon: 22 },
};

/** Opaque fill per semantic kind - a FAB is always high-emphasis. */
const KIND_BACKGROUNDS: Record<FabKind, string> = {
  primary: "var(--accent, #06b6d4)",
  default: "var(--foreground, #111)",
  error: "var(--error, #ef4444)",
  success: "var(--success, #16a34a)",
  warning: "var(--warning, #d97706)",
};

/**
 * Props for the `FloatingActionButton` component.
 */
export interface FloatingActionButtonProps extends UIComponentProps {
  /** SVG path passed to the internal `Icon`. Required - a FAB is always iconic. */
  icon: string;
  /**
   * Accessible label. Required: the regular variant has no visible text, and on
   * the extended variant it is still what a screen reader announces.
   */
  "aria-label": string;
  /**
   * Visible text beside the icon. Passing it switches the button to the
   * **extended** variant: a pill rather than a circle.
   */
  label?: string;
  /**
   * Navigation target. When provided without an `onClick`, the component renders
   * a locale-aware `Link` (from `@repo/i18n/navigation`) instead of a `button`.
   * ⚠ Write the href **locale-less** - `/contribute/species`, never
   * `` `/${locale}/contribute/species` ``.
   */
  href?: string | URL;
  /**
   * Anchor `target` (e.g. `"_blank"`), applied to the rendered `Link` when
   * `href` is used. `"_blank"` automatically gets `rel="noopener noreferrer"`.
   */
  target?: React.HTMLAttributeAnchorTarget;
  /** Click handler. Takes precedence over `href`. */
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>,
  ) => void;
  /** HTML button `type`. Defaults to `button`. */
  type?: FabType;
  /** Which corner the button is fixed to. Defaults to `'bottom-right'`. */
  position?: FabPosition;
  /** Circle diameter (extended height). Defaults to `'lg'`. */
  size?: FabSize;
  /** Semantic color intent. Defaults to `'primary'` (the theme accent). */
  kind?: FabKind;
  /**
   * Distance from both screen edges. Defaults to `var(--ui-fab-offset, 20px)`,
   * so an app can move every FAB at once from its `globals.css`.
   */
  offset?: number | string;
  /** Overrides the auto-derived icon size (md→16px, lg→22px). */
  iconSize?: string | number;
  /** Overrides the icon color. Defaults to white, for contrast on the fill. */
  iconColor?: string;
  /**
   * When `true`, the inner `Icon` renders the SVG as a real multi-color image
   * instead of a single-color mask. Defaults to `false`.
   */
  fullColor?: boolean;
  /** Disables the button and suppresses interaction. */
  disabled?: boolean;
  /** Shows a spinner in place of the icon and disables the button. */
  isLoading?: boolean;
  /** HTML `title` attribute (tooltip on hover). */
  title?: string;
  /**
   * Stacking order. Defaults to `900` - above page content and the fixed navbar,
   * below `Toast` (1000) and `ConfirmationModal` (1100), so a dialog opened *by*
   * the FAB is never drawn under it.
   */
  zIndex?: number;
  /** Indicates whether the button controls an expanded surface. */
  "aria-expanded"?: boolean;
  /** IDs of the elements this button controls. */
  "aria-controls"?: string;
}

/**
 * FloatingActionButton (FAB) - the primary, most common action on a screen,
 * drawn in front of all page content and fixed to one bottom corner.
 *
 * Two variants, picked by whether `label` is passed:
 *
 * - **regular** - a circle with an icon at its centre (`label` omitted).
 * - **extended** - a pill with the icon and a short verb beside it.
 *
 * Because it is `position: fixed`, the button does not scroll with the page and
 * does not participate in any parent's layout - so it may be rendered anywhere
 * in the tree. Pair it with `PageBottomSpacer` (or the app's own bottom
 * padding), or the last line of a page will sit under it.
 *
 * The bottom offset adds `env(safe-area-inset-bottom)`, so on an iPhone the
 * button clears the home indicator rather than tucking behind it.
 *
 * @example Regular, navigating
 * <FloatingActionButton
 *   icon="/icons/add.svg"
 *   aria-label={t("addSpecies")}
 *   href="/contribute/species"
 * />
 *
 * @example Extended, bottom-left, opening a dialog
 * <FloatingActionButton
 *   icon="/icons/add.svg"
 *   aria-label={t("addSighting")}
 *   label={t("addSighting")}
 *   position="bottom-left"
 *   onClick={() => setOpen(true)}
 * />
 */
export const FloatingActionButton: React.FC<FloatingActionButtonProps> = (
  props,
) => {
  const {
    icon,
    label,
    href,
    target,
    onClick,
    type = "button",
    position = "bottom-right",
    size = "lg",
    kind = "primary",
    offset,
    iconSize,
    iconColor,
    fullColor = false,
    disabled,
    isLoading,
    title,
    zIndex = 900,
    className,
    id,
  } = props;

  const ariaLabel = props["aria-label"];
  const ariaExpanded = props["aria-expanded"];
  const ariaControls = props["aria-controls"];

  const isDisabled = disabled || isLoading;
  const extended = label !== undefined && label !== "";
  const { box, icon: defaultIconSize } = BOX_SIZES[size];

  const edge =
    offset === undefined
      ? "var(--ui-fab-offset, 20px)"
      : typeof offset === "number"
        ? `${offset}px`
        : offset;

  const inner = isLoading ? (
    <Spinner size={defaultIconSize} thickness={2} />
  ) : (
    <>
      <Icon
        icon={icon}
        size={iconSize ?? defaultIconSize}
        color={iconColor ?? "#fff"}
        fullColor={fullColor}
      />
      {extended && (
        <Typography
          as="span"
          variant="h6"
          color={iconColor ?? "#fff"}
          fontWeight={600}
          styles={{ whiteSpace: "nowrap" }}
        >
          {label}
        </Typography>
      )}
    </>
  );

  const finalStyle: CSSProperties = {
    position: "fixed",
    // The horizontal edge is the only thing `position` changes; the vertical one
    // is shared, and adds the iOS safe-area inset so the button clears the home
    // indicator instead of sitting under it.
    bottom: `calc(${edge} + env(safe-area-inset-bottom, 0px))`,
    ...(position === "bottom-left" ? { left: edge } : { right: edge }),
    zIndex,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    // An extended FAB keeps the regular one's height and grows sideways, so the
    // two read as the same control at different lengths.
    height: box,
    ...(extended
      ? { minWidth: box, paddingLeft: 10, paddingRight: 11, gap: 10 }
      : { width: box }),
    borderRadius: box / 2,
    border: "none",
    backgroundColor: KIND_BACKGROUNDS[kind],
    cursor: "pointer",
    textDecoration: "none",
    overflow: "hidden",
    ...buildStyleProps(props as UIComponentProps),
    ...props.styles,
  };

  const classes = ["ui-fab", `ui-fab--${kind}`, className]
    .filter(Boolean)
    .join(" ");

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
        title={title ?? ariaLabel}
        className={classes}
        style={finalStyle}
        aria-label={ariaLabel}
        {...(ariaControls !== undefined
          ? { "aria-controls": ariaControls }
          : {})}
      >
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
      title={title ?? ariaLabel}
      disabled={isDisabled}
      className={classes}
      style={finalStyle}
      onClick={typeof onClick === "function" ? handleClick : undefined}
      aria-label={ariaLabel}
      {...(ariaControls !== undefined ? { "aria-controls": ariaControls } : {})}
      {...(ariaExpanded !== undefined ? { "aria-expanded": ariaExpanded } : {})}
    >
      {inner}
    </button>
  );
};

export default FloatingActionButton;
