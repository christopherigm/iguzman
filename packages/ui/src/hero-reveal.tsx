"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import "./hero-reveal.css";

/**
 * How long the hero takes to open from a closed edge to its full height.
 */
export const HERO_REVEAL_DURATION_MS = 900;

/**
 * How long the logo/slogan take to arrive once the box has finished opening.
 * They start together (see `hero-reveal.css`), so this is one number.
 */
export const HERO_REVEAL_CONTENT_DURATION_MS = 700;

/**
 * How long to wait for the video before opening anyway.
 *
 * The reveal is driven by the player reaching *playing*, which is the whole
 * point - a hero that opens on the poster frame would show exactly the flicker
 * this exists to remove. But "playing" is not a promise: a blocked autoplay, a
 * provider outage, an ad-blocked embed or a very slow connection can all leave
 * it unspoken, and a hero that never opens is a landing page with no headline
 * and no call to action. So the wait is bounded, and past this the hero opens on
 * whatever the player has managed to paint.
 */
export const HERO_REVEAL_FALLBACK_MS = 4000;

/** Class the hero puts on its logo, so the reveal can fade it in. */
export const HERO_REVEAL_LOGO_CLASS = "hero-reveal__logo";

/** Class the hero puts on its slogan/subline/actions block. */
export const HERO_REVEAL_TEXT_CLASS = "hero-reveal__text";

/**
 * Published by `HeroReveal` and called by `HeroVideo` the moment playback
 * actually starts - the two are separated by the hero's own (server) markup, so
 * a callback prop cannot reach across and a context can.
 *
 * `null` outside a `HeroReveal`, which is how every other `HeroVideo` consumer
 * (a sighting's video, a species page, the item hero) stays unaffected.
 */
const HeroRevealContext = createContext<(() => void) | null>(null);

/** The reveal signal, or `null` when this video is not gating a reveal. */
export function useHeroRevealSignal(): (() => void) | null {
  return useContext(HeroRevealContext);
}

/**
 * The three states of the reveal:
 *
 * - `hidden` - the box is closed. This is also what the server renders, which is
 *   deliberate: rendering it open and closing it on mount would flash the very
 *   poster frame the reveal exists to hide.
 * - `revealing` - the box is opening, and the content is running its own
 *   animations behind a delay equal to that opening.
 * - `done` - everything has arrived and the wrapper stops constraining the hero.
 *   It has to stop: while opening, the wrapper clips its overflow, and the
 *   `profile` layout's logo disc deliberately hangs *below* the hero's edge.
 */
type RevealStage = "hidden" | "revealing" | "done";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type HeroRevealProps = {
  /** The hero, exactly as it would have been rendered without the reveal. */
  children: ReactNode;
  /**
   * Gate the hero on its video. `false` hands `children` straight back
   * untouched (an image hero has nothing to wait for), the way
   * `ParallaxLayer`'s `disabled` does. @default true
   */
  enabled?: boolean;
  /** Opening duration in ms. @default HERO_REVEAL_DURATION_MS */
  duration?: number;
  /** Logo/text duration in ms. @default HERO_REVEAL_CONTENT_DURATION_MS */
  contentDuration?: number;
  /** How long to wait for playback. @default HERO_REVEAL_FALLBACK_MS */
  fallbackMs?: number;
};

/**
 * HeroReveal - holds a video hero closed until its video is actually playing,
 * then opens it.
 *
 * A hero video is a poster frame long before it is a video: YouTube paints its
 * thumbnail, then its chrome, then the first frame, and a hero rendered at full
 * height through all of that flickers through three different pictures before it
 * settles. So the hero is rendered closed, `HeroVideo` reports the player
 * reaching *playing* through the context above, and only then does the box open
 * to its full height - carrying the first frame of real video with it. The logo
 * fades in as the box finishes opening and the slogan/CTA rise into place beside
 * it (`hero-reveal.css` owns both).
 *
 * ⚠ **The box is opened with `grid-template-rows: 0fr → 1fr`, not `height`.**
 * A hero's height is a `clamp()` in one layout and an intrinsic
 * hero-plus-overhanging-disc in the `profile` one, and `height: auto` is not a
 * transitionable value - the same reason `apps/website`'s portion picker and its
 * phone menu index fold that way rather than animating a height.
 *
 * ⚠ **The page below moves.** Opening the hero pushes the rest of the landing
 * down by the hero's full height, which is a real layout shift - it is the
 * effect being asked for (the hero opens *into* the page), but it is why the
 * wait is bounded by `fallbackMs` rather than open-ended.
 *
 * ⚠ **While closed it stands in for the navbar.** A landing starts with the hero
 * precisely *because* the hero is what runs under the fixed navbar - so a page
 * whose hero is closed has nothing reserving that height, and the section below
 * (Featured, About) rides up under the bar with its heading half cut off. So the
 * closed hero is not zero-height but navbar-height, and that spacer collapses to
 * nothing over exactly the opening's duration - the hero grows into the space the
 * spacer gives up, and the page below never moves twice.
 *
 * Under `prefers-reduced-motion: reduce` the hero still waits for the video -
 * the flicker is a defect, not a flourish - and then simply appears, with no
 * opening and no arrival animations.
 */
export function HeroReveal({
  children,
  enabled = true,
  duration = HERO_REVEAL_DURATION_MS,
  contentDuration = HERO_REVEAL_CONTENT_DURATION_MS,
  fallbackMs = HERO_REVEAL_FALLBACK_MS,
}: HeroRevealProps) {
  const [stage, setStage] = useState<RevealStage>("hidden");
  const boxRef = useRef<HTMLDivElement>(null);

  // Idempotent: the player reports `playing` again on every loop and on every
  // unpause, and the fallback timer may beat all of them.
  const reveal = useCallback(() => {
    setStage((current) =>
      current !== "hidden"
        ? current
        : prefersReducedMotion()
          ? "done"
          : "revealing",
    );
  }, []);

  // The bounded wait. Armed once, on mount - a hero that has already opened
  // ignores it through the guard above.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(reveal, fallbackMs);
    return () => window.clearTimeout(timer);
  }, [enabled, fallbackMs, reveal]);

  // Belt and braces for the end of the opening. `transitionend` below is the
  // exact signal, but it never arrives where the transition itself does not run
  // (a browser with no `grid-template-rows` interpolation jumps straight to the
  // open size), and being stuck in `revealing` means a permanently clipped
  // wrapper - which in the `profile` layout eats the logo disc.
  useEffect(() => {
    if (stage !== "revealing") return;
    const timer = window.setTimeout(() => setStage("done"), duration + 150);
    return () => window.clearTimeout(timer);
  }, [stage, duration]);

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    // Only the box's own opening - the navbar spacer beside it and the hero
    // underneath both have transitions of their own, and they bubble through
    // here.
    if (event.target !== boxRef.current) return;
    if (event.propertyName !== "grid-template-rows") return;
    setStage((current) => (current === "revealing" ? "done" : current));
  };

  if (!enabled) return <>{children}</>;

  return (
    <HeroRevealContext.Provider value={reveal}>
      <div
        className={[
          "hero-reveal",
          stage !== "hidden" ? "hero-reveal--revealed" : "",
          stage === "done" ? "hero-reveal--done" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onTransitionEnd={handleTransitionEnd}
        style={{
          // The CSS reads both durations from here, so one number drives the
          // opening, the delay the content waits out, and the safety timer.
          ["--hero-reveal-duration" as string]: `${duration}ms`,
          ["--hero-reveal-content-duration" as string]: `${contentDuration}ms`,
        }}
      >
        {/* Stands in for the hero under the fixed navbar while the hero is
            closed, and gives that height back over the same duration and curve
            the hero takes to claim it. Left mounted at zero height once open:
            it costs nothing, and unmounting it would be a second reflow at the
            exact moment the reveal is trying to look seamless.

            ⚠ It is a *sibling* of the opening box rather than a second grid
            track, so that box's `grid-template-rows` stays a single `0fr → 1fr`
            it can interpolate. An `auto 0fr → auto 1fr` list asks the engine to
            interpolate a track list with a keyword in it, which is not a
            guarantee worth resting the whole reveal on. */}
        <div className="hero-reveal__navbar-spacer" />
        <div ref={boxRef} className="hero-reveal__box">
          <div className="hero-reveal__inner">{children}</div>
        </div>
      </div>
    </HeroRevealContext.Provider>
  );
}

export default HeroReveal;
