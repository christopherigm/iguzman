import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, Ref, ReactNode } from 'react';
import './tokens.css';
import './tv-scrollable.css';

export interface TvScrollableProps {
  children: ReactNode;
  className?: string;
  /**
   * Caps the visible height; content taller than this scrolls. Any CSS length
   * (`'70vh'`, `560`). Give an *explicit* value - a percentage resolved against
   * a derived-height parent collapses to zero on old Tizen Chromium (76), the
   * same trap documented for TvImage backdrops.
   */
  maxHeight?: number | string;
  /**
   * Pixels scrolled per D-pad press. Defaults to 80% of the visible height so a
   * press advances by nearly a full page while keeping a line of overlap.
   */
  scrollStep?: number;
  /** Grab the initial D-pad focus on mount (see Focusable). */
  focusOnMount?: boolean;
}

/**
 * A D-pad-scrollable region for tall, otherwise-unfocusable content (long
 * synopsis, metadata stacks). On a TV there is no pointer or wheel, so the
 * region itself is focusable: while focused, Up/Down scroll its content a step
 * at a time, and only once it reaches the top/bottom edge does the key fall
 * through to Norigin to move focus out. Top/bottom fades appear when there is
 * more content in that direction.
 *
 * Children are plain content - they do not need to be focusable (that is the
 * point; the container scrolls them, unlike a focus-follows grid).
 */
export function TvScrollable({
  children,
  className,
  maxHeight,
  scrollStep,
  focusOnMount,
}: TvScrollableProps) {
  // Our own ref to the scrolling viewport. Norigin's ref goes on the outer box
  // (what it measures for spatial layout and paints the focus ring on); the
  // inner viewport is what actually overflows and scrolls.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const updateEdges = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const top = el.scrollTop > 0;
    // -1 absorbs sub-pixel rounding so a fully-scrolled box reads as "no more".
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) =>
      prev.top === top && prev.bottom === bottom ? prev : { top, bottom },
    );
  }, []);

  const onArrowPress = useCallback(
    (direction: string) => {
      const el = viewportRef.current;
      if (!el) return true;
      const step = scrollStep ?? Math.round(el.clientHeight * 0.8);
      const max = el.scrollHeight - el.clientHeight;
      if (direction === 'down' && el.scrollTop < max - 1) {
        el.scrollTop = Math.min(max, el.scrollTop + step);
        updateEdges();
        return false; // consumed - keep focus here
      }
      if (direction === 'up' && el.scrollTop > 0) {
        el.scrollTop = Math.max(0, el.scrollTop - step);
        updateEdges();
        return false;
      }
      // At an edge (or left/right): let Norigin move focus out.
      return true;
    },
    [scrollStep, updateEdges],
  );

  const { ref, focused, focusSelf } = useFocusable({ onArrowPress });

  useEffect(() => {
    if (focusOnMount) focusSelf();
  }, [focusOnMount, focusSelf]);

  // Recompute the fades when the content box resizes (text reflow, late images)
  // and once on mount. ResizeObserver ships in Chromium 64, below the Tizen 76
  // floor, so it is safe here.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateEdges]);

  const cls = ['tv-scrollable', 'tv-focusable', focused ? 'tv-focusable--focused' : '', className]
    .filter(Boolean)
    .join(' ');

  const viewportStyle: CSSProperties | undefined =
    maxHeight === undefined ? undefined : { maxHeight };

  return (
    <div ref={ref as Ref<HTMLDivElement>} className={cls}>
      <div
        ref={viewportRef}
        className="tv-scrollable__viewport"
        style={viewportStyle}
        onScroll={updateEdges}
      >
        {children}
      </div>
      {edges.top && (
        <div className="tv-scrollable__fade tv-scrollable__fade--top" aria-hidden="true" />
      )}
      {edges.bottom && (
        <div className="tv-scrollable__fade tv-scrollable__fade--bottom" aria-hidden="true" />
      )}
    </div>
  );
}
