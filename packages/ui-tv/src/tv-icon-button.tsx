import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect } from "react";
import type { CSSProperties, Ref } from "react";
import "./tokens.css";
import "./tv-icon-button.css";

/** Semantic color intent for an icon button (mirrors TvButton's kinds). */
export type TvIconButtonKind = "primary" | "success" | "error" | "warning";

/** Square box size. Scaled for 10-foot viewing, so even `sm` is large by web standards. */
export type TvIconButtonSize = "sm" | "md" | "lg";

export interface TvIconButtonProps {
  /**
   * Icon glyph. Pass an imported SVG URL (e.g. `import dice from '@/icons/dice.svg'`).
   * The SVG is used as a CSS mask tinted to `currentColor`, so a single-color
   * source glyph inherits the button's focus/kind/selected colors - the source
   * SVG's own fill is irrelevant, only its shape (alpha) is used.
   */
  icon: string;
  /**
   * Accessible label. Required: an icon-only button has no text for a screen
   * reader (or the TV's voice guide) to announce. Also used as the `title`.
   */
  ariaLabel: string;
  onPress?: () => void;
  className?: string;
  disabled?: boolean;
  /** Square box size. @default 'md' */
  size?: TvIconButtonSize;
  /**
   * Semantic color intent. Like `TvButton`, the tint applies **only while
   * focused** - an unfocused kinded button reads as the neutral surface-2
   * button. Omit for a neutral button.
   */
  kind?: TvIconButtonKind;
  /**
   * Persistent selected/toggled state (e.g. a shuffle button while the catalog
   * is shuffled). Keeps the accent fill whether or not the button holds focus,
   * so an active mode still reads as active after focus moves elsewhere.
   */
  selected?: boolean;
  /**
   * Stable focus key for the underlying focusable node. Provide one when another
   * component needs to restore focus here via Norigin's `setFocus(focusKey)`.
   */
  focusKey?: string;
  /**
   * Scroll the button into view when it gains focus. Use inside a scrollable
   * container; harmless (a no-op) when nothing scrolls.
   */
  scrollOnFocus?: boolean;
  /** Fires when the button gains D-pad focus (for focus-driven side effects). */
  onFocusChange?: () => void;
  /**
   * Intercept a D-pad arrow while this button is focused. Return `false` to
   * prevent Norigin's default navigation and move focus yourself via `setFocus`;
   * return `true` to let the default proceed.
   */
  onArrowPress?: (direction: string) => boolean;
}

/**
 * D-pad-focusable, icon-only square button - the 10-foot counterpart of
 * `@repo/ui`'s `IconButton`. Enter on the remote triggers `onPress`.
 *
 * Unlike the web `IconButton` (transparent ghost with a hover tint), this reads
 * as a solid surface-2 tile at rest: a TV has no hover, so the button must be
 * discoverable without one, and the focus ring is the only affordance that
 * matters.
 *
 * @example
 * import dice from '@/icons/dice.svg';
 * <TvIconButton icon={dice} ariaLabel={t('shuffle')} onPress={reroll} />
 */
export function TvIconButton({
  icon,
  ariaLabel,
  onPress,
  className,
  disabled = false,
  size = "md",
  kind,
  selected = false,
  focusKey,
  scrollOnFocus = false,
  onFocusChange,
  onArrowPress,
}: TvIconButtonProps) {
  // A disabled button drops out of spatial navigation so the D-pad skips it.
  const { ref, focused } = useFocusable({
    onEnterPress: onPress,
    focusable: !disabled,
    focusKey,
    onFocus: onFocusChange,
    onArrowPress: onArrowPress
      ? (direction) => onArrowPress(direction)
      : undefined,
  });

  // Reveal an off-screen button when focus lands on it (scrollable lists/modals).
  useEffect(() => {
    if (scrollOnFocus && focused) {
      (
        ref as Ref<HTMLButtonElement> & { current: HTMLButtonElement | null }
      ).current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [scrollOnFocus, focused, ref]);

  const cls = [
    "tv-icon-button",
    `tv-icon-button--${size}`,
    "tv-focusable",
    // A disabled button always reads as neutral, matching TvButton.
    kind && !disabled ? `tv-icon-button--${kind}` : "",
    selected && !disabled ? "tv-icon-button--selected" : "",
    focused ? "tv-focusable--focused" : "",
    disabled ? "tv-icon-button--disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      className={cls}
      onClick={disabled ? undefined : onPress}
      disabled={disabled}
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {/* Quote the URL: Vite inlines small SVGs as data URIs whose path data
          contains commas/parens that break an unquoted url() and drop the mask. */}
      <span
        className="tv-icon-button__icon"
        aria-hidden="true"
        style={{ "--tv-icon-button-icon": `url("${icon}")` } as CSSProperties}
      />
    </button>
  );
}
