'use client';

import { useEffect, useRef } from 'react';

/**
 * Props for the ScrollToBottom component
 */
export interface ScrollToBottomProps {
  /**
   * Whether to scroll to bottom when component mounts
   * @default true
   */
  scrollToBottomOnMount?: boolean;
  /**
   * Whether to scroll to bottom when component updates
   * @default false
   */
  scrollToBottomOnUpdate?: boolean;
  /**
   * Scroll behavior when scrolling to bottom
   * @default 'smooth'
   */
  scrollBehavior?: 'auto' | 'smooth';
}

/**
 * ScrollToBottom component that automatically scrolls to the bottom of the page
 *
 * @example
 * ```tsx
 * import { ScrollToBottom } from '@iguzman/ui/scroll-to-bottom';
 *
 * function MyComponent() {
 *   return (
 *     <div>
 *       <ScrollToBottom />
 *     </div>
 *   );
 * }
 * ```
 */
export function ScrollToBottom({
  scrollToBottomOnMount = true,
  scrollToBottomOnUpdate = false,
  scrollBehavior = 'smooth',
}: ScrollToBottomProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollToBottomOnMount) {
      scrollToBottom(scrollBehavior);
    }
  }, [scrollToBottomOnMount, scrollBehavior]);

  useEffect(() => {
    if (scrollToBottomOnUpdate) {
      scrollToBottom(scrollBehavior);
    }
  }, [scrollToBottomOnUpdate, scrollBehavior]);

  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
    if (typeof window === 'undefined' || !document.body) {
      return;
    }

    try {
      window.scrollTo({
        left: 0,
        top: document.body.scrollHeight,
        behavior,
      });
    } catch (error) {
      // Fallback for browsers that don't support smooth scrolling
      console.error('Failed to scroll to bottom:', error);
      window.scrollTo(0, document.body.scrollHeight);
    }
  };

  return <div ref={elementRef} />;
}

export default ScrollToBottom;
