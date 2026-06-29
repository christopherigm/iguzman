import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import type { ReactNode, Ref } from 'react';
import './tokens.css';

interface FocusableRenderProps {
  focused: boolean;
}

export interface FocusableProps {
  onEnterPress?: () => void;
  onFocus?: () => void;
  className?: string;
  /** Wrap children in a FocusContext so they form a navigable group. */
  group?: boolean;
  children: ReactNode | ((props: FocusableRenderProps) => ReactNode);
}

/**
 * Generic D-pad-focusable wrapper. Use `group` for a container whose children
 * should be navigated as a unit; otherwise it is a single focusable item.
 */
export function Focusable({ onEnterPress, onFocus, className, group, children }: FocusableProps) {
  const { ref, focused, focusKey } = useFocusable({
    onEnterPress,
    onFocus,
    trackChildren: group,
  });

  const cls = ['tv-focusable', focused ? 'tv-focusable--focused' : '', className]
    .filter(Boolean)
    .join(' ');

  const content = typeof children === 'function' ? children({ focused }) : children;
  const node = (
    <div ref={ref as Ref<HTMLDivElement>} className={cls}>
      {content}
    </div>
  );

  return group ? <FocusContext.Provider value={focusKey}>{node}</FocusContext.Provider> : node;
}
