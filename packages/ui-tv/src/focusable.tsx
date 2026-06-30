import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';
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
  /**
   * Grab the initial D-pad focus when this mounts. Norigin focuses nothing by
   * default, so without a node claiming focus the remote's arrows and Enter are
   * all no-ops. Set this on the top-level container of a screen. For a `group`,
   * focus delegates to the first focusable child.
   */
  focusOnMount?: boolean;
  children: ReactNode | ((props: FocusableRenderProps) => ReactNode);
}

/**
 * Generic D-pad-focusable wrapper. Use `group` for a container whose children
 * should be navigated as a unit; otherwise it is a single focusable item.
 */
export function Focusable({
  onEnterPress,
  onFocus,
  className,
  group,
  focusOnMount,
  children,
}: FocusableProps) {
  const { ref, focused, focusKey, focusSelf } = useFocusable({
    onEnterPress,
    onFocus,
    trackChildren: group,
  });

  useEffect(() => {
    if (focusOnMount) focusSelf();
  }, [focusOnMount, focusSelf]);

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
