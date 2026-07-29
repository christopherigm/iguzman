"use client";

import React, { CSSProperties } from "react";
import { UIComponentProps, buildStyleProps } from "./utils";
import { Icon } from "./icon";
import "./move-handle.css";

/** Standardized handle size tokens (square box dimensions, matching IconButton). */
export type MoveHandleSize = "sm" | "md" | "lg";

/**
 * Which surface the handle sits on.
 *
 * - `outlined` - on a form or table surface: a faint tinted chip with a muted
 *   glyph, so it reads as a sibling of the `IconButton`s beside it.
 * - `overlay` - over a photograph: a translucent dark chip with a white glyph,
 *   which is the only way a single-colour glyph stays legible over an arbitrary
 *   image.
 */
export type MoveHandleVariant = "outlined" | "overlay";

/** The default glyph. Every app keeps it at this path in `public/icons/`. */
export const MOVE_HANDLE_ICON = "/icons/handler.svg";

/** Square box size and border-radius per size token. */
const BOX_STYLES: Record<
  MoveHandleSize,
  Pick<CSSProperties, "width" | "height" | "borderRadius">
> = {
  sm: { width: 28, height: 28, borderRadius: 6 },
  md: { width: 36, height: 36, borderRadius: 8 },
  lg: { width: 44, height: 44, borderRadius: 10 },
};

const ICON_SIZES: Record<MoveHandleSize, number> = {
  sm: 16,
  md: 18,
  lg: 20,
};

const VARIANT_STYLES: Record<MoveHandleVariant, CSSProperties> = {
  outlined: {
    border:
      "1px solid color-mix(in srgb, var(--foreground, #111) 14%, transparent)",
    backgroundColor:
      "color-mix(in srgb, var(--foreground, #111) 7%, transparent)",
  },
  overlay: {
    border: "none",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
};

const VARIANT_ICON_COLORS: Record<MoveHandleVariant, string> = {
  outlined: "var(--muted-foreground, #6b7280)",
  overlay: "#fff",
};

/**
 * Props for `MoveHandle`.
 */
export interface MoveHandleProps extends UIComponentProps {
  /**
   * Accessible label - what re-ordering this row/tile does. **Required unless
   * `decorative`**, since the glyph carries no text.
   */
  "aria-label"?: string;
  /** HTML `title` attribute (tooltip shown on hover). */
  title?: string;
  /**
   * When `true` the handle is only the *affordance*: something else (the whole
   * row, the whole tile) is the drag source, so this is hidden from the
   * accessibility tree and takes no drag handlers. The re-ordering itself must
   * then be reachable some other way - see `apps/animals`' photo picker, where
   * the "use as cover" button is that way.
   */
  decorative?: boolean;
  /**
   * Makes the handle itself the native HTML5 drag source. Defaults to `true`
   * unless `decorative`.
   */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLSpanElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLSpanElement>) => void;
  /** Controls box dimensions and auto-derived icon size. Defaults to `'md'`. */
  size?: MoveHandleSize;
  /** Which surface the handle sits on. Defaults to `'outlined'`. */
  variant?: MoveHandleVariant;
  /** Overrides the glyph. Defaults to `/icons/handler.svg`. */
  icon?: string;
  /** Overrides the auto-derived icon size (sm→16px, md→18px, lg→20px). */
  iconSize?: string | number;
  /** Overrides the glyph color. Defaults to the color for `variant`. */
  iconColor?: string;
}

/**
 * MoveHandle - the grab affordance on a re-orderable row or tile: an
 * `IconButton`-shaped chip carrying the `handler.svg` grid glyph.
 *
 * ⚠ **It renders a `<span>`, never a `<button>`, and that is not an oversight.**
 * A handle's whole job is to be an HTML5 drag source, and Firefox ignores
 * `draggable` on form controls - a `<button draggable>` simply never fires
 * `dragstart` there, so sort mode would silently die in one browser. The
 * trade-off is that it is not keyboard-operable either, which is why every
 * consumer keeps a non-drag way to do the same thing (the CMS lists persist
 * `sort_order` on save; the contribute photo picker has a "use as cover"
 * button). Don't "upgrade" it to a `<button>` or give it `role="button"` - the
 * latter would promise an Enter/Space action that does not exist.
 *
 * @example Drag source (the handle is what you grab)
 * <MoveHandle
 *   aria-label={t("dragToReorder")}
 *   title={t("dragToReorder")}
 *   size="sm"
 *   onDragStart={() => setDragIndex(index)}
 *   onDragEnd={handleDragEnd}
 * />
 * @example Affordance only (the tile around it is the drag source)
 * <MoveHandle decorative variant="overlay" size="sm" />
 */
export const MoveHandle: React.FC<MoveHandleProps> = (props) => {
  const {
    title,
    decorative = false,
    draggable = !decorative,
    onDragStart,
    onDragEnd,
    size = "md",
    variant = "outlined",
    icon = MOVE_HANDLE_ICON,
    iconSize,
    iconColor,
    className,
    id,
  } = props;

  const ariaLabel = props["aria-label"];

  const finalStyle: CSSProperties = {
    ...BOX_STYLES[size],
    ...VARIANT_STYLES[variant],
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...buildStyleProps(props as UIComponentProps),
    ...props.styles,
  };

  const classes = ["ui-move-handle", className].filter(Boolean).join(" ");

  return (
    <span
      id={id}
      className={classes}
      style={finalStyle}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={decorative ? undefined : title}
      aria-label={decorative ? undefined : ariaLabel}
      aria-hidden={decorative ? true : undefined}
    >
      <Icon
        icon={icon}
        size={iconSize ?? ICON_SIZES[size]}
        color={iconColor ?? VARIANT_ICON_COLORS[variant]}
      />
    </span>
  );
};

export default MoveHandle;
