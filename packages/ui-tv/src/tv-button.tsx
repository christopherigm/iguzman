import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
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
}

/** D-pad-focusable button. Enter on the remote triggers `onPress`. */
export function TvButton({ children, onPress, className, disabled = false, kind }: TvButtonProps) {
  // A disabled button drops out of spatial navigation so the D-pad skips it.
  const { ref, focused } = useFocusable({ onEnterPress: onPress, focusable: !disabled });
  const cls = [
    'tv-button',
    'tv-focusable',
    // A disabled button always reads as neutral, matching @repo/ui's Button.
    kind && !disabled ? `tv-button--${kind}` : '',
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
