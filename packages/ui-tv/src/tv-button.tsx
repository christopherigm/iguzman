import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { ReactNode, Ref } from 'react';
import './tokens.css';

export interface TvButtonProps {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  disabled?: boolean;
}

/** D-pad-focusable button. Enter on the remote triggers `onPress`. */
export function TvButton({ children, onPress, className, disabled = false }: TvButtonProps) {
  // A disabled button drops out of spatial navigation so the D-pad skips it.
  const { ref, focused } = useFocusable({ onEnterPress: onPress, focusable: !disabled });
  const cls = [
    'tv-button',
    'tv-focusable',
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
