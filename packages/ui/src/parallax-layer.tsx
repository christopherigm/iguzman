"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type ParallaxLayerProps = {
  /** The background to drift - an `<img>`, a video player, etc. Positioned against this layer. */
  children: ReactNode;
  /**
   * The fraction of the page's scroll speed at which the background rises.
   * 0.5 is half speed; 1 scrolls with the page (no effect) and 0 pins the
   * background in place. The child is cropped by `1 - speed` to cover the drift.
   */
  speed?: number;
  /** Render the child statically, without scroll listeners. */
  disabled?: boolean;
};

/**
 * ParallaxLayer - rises a hero background more slowly than the page as it
 * scrolls, so the background reads as sitting behind the page rather than on it.
 *
 * Place it inside a positioned, `overflow: hidden` container (e.g. `Hero`); it
 * fills that container and renders the child in a box that is `1 - speed` taller,
 * hanging off the top. Scrolling slides that box down by the amount the hero has
 * passed the top of the viewport, which cancels part of the page's own scroll and
 * leaves the background moving at `speed`. The drift is bounded by the hero's own
 * height, so the overscan always covers it and no edge is ever exposed.
 *
 * The drift is anchored to the top of the viewport rather than to the hero's
 * centre because that is the only anchor that yields a constant, honest `speed`
 * without cropping the child far more heavily. It assumes the hero starts at the
 * top of its page, as every hero in `website` does; a hero placed further down
 * simply stays still until it reaches the top.
 *
 * Honors `prefers-reduced-motion: reduce` by staying put and never subscribing
 * to scroll.
 */
export function ParallaxLayer({
  children,
  speed = 0.5,
  disabled = false,
}: ParallaxLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // How much of the page's scroll the background gives back, which is also the
  // fraction of extra height it needs to give it back out of.
  const lag = 1 - speed;

  useEffect(() => {
    if (disabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();

      // How far the hero has scrolled past the top of the viewport, capped at
      // its own height - past that it is gone and the drift has nothing to say.
      const scrolledPast = Math.min(Math.max(-rect.top, 0), rect.height);

      inner.style.transform = `translate3d(0, ${scrolledPast * lag}px, 0)`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [lag, disabled]);

  // Without the drift there is nothing to hide, so hand the child straight back
  // to the hero rather than cropping it into an overscanned box.
  if (disabled) return <>{children}</>;

  return (
    <div
      ref={rootRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <div
        ref={innerRef}
        style={{
          position: "absolute",
          top: `-${lag * 100}%`,
          left: 0,
          right: 0,
          height: `${(1 + lag) * 100}%`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default ParallaxLayer;
