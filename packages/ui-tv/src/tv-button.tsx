import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { ReactNode, Ref } from 'react';
import './tokens.css';

export interface TvButtonProps {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
}

/** D-pad-focusable button. Enter on the remote triggers `onPress`. */
export function TvButton({ children, onPress, className }: TvButtonProps) {
  const { ref, focused } = useFocusable({ onEnterPress: onPress });
  const cls = ['tv-button', 'tv-focusable', focused ? 'tv-focusable--focused' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref as Ref<HTMLButtonElement>} className={cls} onClick={onPress} type="button">
      {children}
    </button>
  );
}
