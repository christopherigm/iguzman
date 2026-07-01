import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';
import type { ReactNode, Ref } from 'react';
import './tokens.css';

/** Semantic color intent for a button (mirrors @repo/ui's ButtonKind). */
export type TvButtonKind = 'primary' | 'success' | 'error' | 'warning';

export interface TvButtonProps {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  disabled?: boolean;
  /** Semantic color intent. Omit for the neutral surface-2 button. */
  kind?: TvButtonKind;
  /**
   * Persistent selected/toggled state (e.g. a genre filter chip). Unlike `kind`
   * - which tints only while focused so the focus ring reads - `selected` keeps
   * the accent fill whether or not the button holds focus, so a chosen option
   * still reads as chosen after focus moves elsewhere.
   */
  selected?: boolean;
  /**
   * Stable focus key for the underlying focusable node. Provide one when another
   * component needs to restore focus here via Norigin's `setFocus(focusKey)` -
   * e.g. returning focus to the button that opened a modal once it closes.
   */
  focusKey?: string;
  /**
   * Scroll the button into view when it gains focus. Use inside a scrollable
   * container (overflowing list/modal) so focusing an off-screen button reveals
   * it; harmless (a no-op) when nothing scrolls. Off by default so the grid's
   * own layout is untouched.
   */
  scrollOnFocus?: boolean;
  /**
   * Fires when the button gains D-pad focus. Use for focus-driven side effects
   * (e.g. a paginator that loads a page the moment its number is focused).
   */
  onFocusChange?: () => void;
  /**
   * Intercept a D-pad arrow while this button is focused. Return `false` to
   * prevent Norigin's default navigation and move focus yourself via
   * `setFocus`; return `true` to let the default proceed.
   */
  onArrowPress?: (direction: string) => boolean;
}

/** D-pad-focusable button. Enter on the remote triggers `onPress`. */
export function TvButton({
  children,
  onPress,
  className,
  disabled = false,
  kind,
  selected = false,
  focusKey,
  scrollOnFocus = false,
  onFocusChange,
  onArrowPress,
}: TvButtonProps) {
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
  // `block: 'nearest'` keeps it instant and does nothing when no ancestor scrolls.
  useEffect(() => {
    if (scrollOnFocus && focused) {
      (ref as Ref<HTMLButtonElement> & { current: HTMLButtonElement | null }).current?.scrollIntoView(
        { block: 'nearest', inline: 'nearest' },
      );
    }
  }, [scrollOnFocus, focused, ref]);

  const cls = [
    'tv-button',
    'tv-focusable',
    // A disabled button always reads as neutral, matching @repo/ui's Button.
    kind && !disabled ? `tv-button--${kind}` : '',
    selected && !disabled ? 'tv-button--selected' : '',
    focused ? 'tv-focusable--focused' : '',
    disabled ? 'tv-button--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      className={cls}
      onClick={disabled ? undefined : onPress}
      disabled={disabled}
      type="button"
    >
      {children}
    </button>
  );
}
