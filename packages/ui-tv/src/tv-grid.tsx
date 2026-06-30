import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';
import type { ReactNode, Ref } from 'react';
import './tv-grid.css';

export interface TvGridProps {
  children: ReactNode;
  /**
   * Grab the initial D-pad focus when this mounts (delegates to the first
   * focusable child). See `Focusable`'s `focusOnMount`.
   */
  focusOnMount?: boolean;
  className?: string;
}

/**
 * Fixed 4-column grid for the (constant-size) TV screen. Wraps its children in a
 * FocusContext so the contained focusable items are navigable in every direction
 * (the spatial-navigation engine resolves up/down/left/right from DOM geometry).
 */
export function TvGrid({ children, focusOnMount, className }: TvGridProps) {
  const { ref, focusKey, focusSelf } = useFocusable({ trackChildren: true });

  useEffect(() => {
    if (focusOnMount) focusSelf();
  }, [focusOnMount, focusSelf]);

  const cls = ['tv-grid', className].filter(Boolean).join(' ');

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref as Ref<HTMLDivElement>} className={cls}>
        {children}
      </div>
    </FocusContext.Provider>
  );
}
