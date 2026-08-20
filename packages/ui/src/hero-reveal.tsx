"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { Spinner } from "./core-elements/spinner";
import {
  HERO_REVEAL_CONTENT_DURATION_MS,
  HERO_REVEAL_DURATION_MS,
  HERO_REVEAL_FALLBACK_MS,
  HERO_REVEAL_LOGO_CLASS,
  HERO_REVEAL_SPINNER_BOX,
  HERO_REVEAL_SPINNER_SIZE,
  HERO_REVEAL_SPINNER_THICKNESS,
} from "./hero-reveal-constants";
import "./hero-reveal.css";

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
 * - `hidden` - the box is closed and the placeholder holds the hero's space.
 *   This is also what the server renders, which is deliberate: rendering it open
 *   and closing it on mount would flash the very poster frame the reveal exists
 *   to hide.
 * - `revealing` - the box is opening, the placeholder's mark is travelling to
 *   where the hero's own logo sits, and the text is running its own animation
 *   behind a delay equal to the opening.
 * - `done` - everything has arrived: the placeholder goes away, the hero's own
 *   logo takes over from the copy that travelled (same place, same size, so the
 *   swap is invisible) and the wrapper stops constraining the hero. It has to
 *   stop: while opening, the wrapper clips its overflow, and the `profile`
 *   layout's logo disc deliberately hangs *below* the hero's edge.
 */
type RevealStage = "hidden" | "revealing" | "done";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Pre-paint on the client, plain effect on the server render pass - the
 * measurement below must land before the browser paints (an unscaled mark for
 * one frame is a visible pop), and `useLayoutEffect` warns during SSR.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type HeroRevealProps = {
  /** The hero, exactly as it would have been rendered without the reveal. */
  children: ReactNode;
  /**
   * Gate the hero on its video. `false` hands `children` straight back
   * untouched (an image hero has nothing to wait for), the way
   * `ParallaxLayer`'s `disabled` does. @default true
   */
  enabled?: boolean;
  /**
   * The height the hero will occupy once open, as a CSS length - including
   * anything hanging off it, like the `profile` layout's overhanging disc. It is
   * what the placeholder reserves while the video buffers, so the page below
   * never moves when the hero arrives. Defaults to the navbar's height, which is
   * the least a closed hero can hold (see the class docs).
   */
  placeholderHeight?: string;
  /**
   * A copy of the hero's mark, drawn centred in the placeholder while the video
   * buffers and then glided into the hero's own logo position. Omit it (a hero
   * with no logo, or the `none` layout) and the placeholder simply holds the
   * space.
   */
  placeholderLogo?: ReactNode;
  /**
   * Accessible label for the spinner under the mark. English by default, like
   * every other string in this package; a localised app passes its own.
   * @default "Loading"
   */
  loadingLabel?: string;
  /** Opening duration in ms. @default HERO_REVEAL_DURATION_MS */
  duration?: number;
  /** Slogan/CTA duration in ms. @default HERO_REVEAL_CONTENT_DURATION_MS */
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
 * to its full height - carrying the first frame of real video with it.
 *
 * ⚠ **While it waits, the hero's whole height is already on the page.** The
 * placeholder is an invisible box of exactly the height the hero will occupy
 * (`placeholderHeight`, the overhanging `profile` disc included) with the
 * tenant's mark centred in it under a slow light sweep - so a reader who lands
 * mid-buffer sees the brand and a page that is already laid out, rather than a
 * bare navbar over the second section. It also means the page below **does not
 * move** when the hero arrives: the box grows into space that was already
 * reserved.
 *
 * ⚠ **The mark that travels is the placeholder's copy, not the hero's own.**
 * The hero's logo sits inside the box being opened, and that box clips its
 * overflow for the whole of the opening - so for most of the travel the real
 * mark is not on screen to move. Instead the copy is measured against it (a FLIP:
 * `--hero-reveal-logo-scale` matches their drawn sizes, `--hero-reveal-logo-dx/dy`
 * the distance between their centres), glides there over the opening, and the two
 * swap at `done`. Landing on the same place at the same size is what lets the
 * logo arrive with **no fade at all** - it has been on screen since the first
 * frame, and fading it in would be the page admitting it drew it twice.
 *
 * ⚠ **The box is opened with `grid-template-rows: 0fr → 1fr`, not `height`.**
 * A hero's height is a `clamp()` in one layout and an intrinsic
 * hero-plus-overhanging-disc in the `profile` one, and `height: auto` is not a
 * transitionable value - the same reason `apps/website`'s portion picker and its
 * phone menu index fold that way rather than animating a height.
 *
 * ⚠ **The wait is bounded** by `fallbackMs`, and a player error opens the hero
 * rather than hiding it for good: a landing with no headline and no call to
 * action is worse than a flicker.
 *
 * Under `prefers-reduced-motion: reduce` the hero still waits for the video -
 * the flicker is a defect, not a flourish - and then simply appears, with no
 * opening, no travel and no arrival animations.
 */
export function HeroReveal({
  children,
  enabled = true,
  placeholderHeight,
  placeholderLogo,
  loadingLabel = "Loading",
  duration = HERO_REVEAL_DURATION_MS,
  contentDuration = HERO_REVEAL_CONTENT_DURATION_MS,
  fallbackMs = HERO_REVEAL_FALLBACK_MS,
}: HeroRevealProps) {
  const [stage, setStage] = useState<RevealStage>("hidden");
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);

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

  /*
   * The FLIP measurement behind the mark's travel: how much bigger the hero's
   * own logo is drawn than the placeholder's copy, and how far apart their
   * centres are. Both are written as custom properties and applied by
   * `hero-reveal.css` - the scale immediately (so the copy is the hero's logo at
   * the hero's size from the first frame), the translation only once the class
   * flips to revealed, which is what makes it a transition rather than a jump.
   *
   * The hero's logo can be measured while the box is still closed: the box's
   * closed row is 0fr but its content is still laid out at full size and merely
   * clipped, and the placeholder is out of flow, so the hero's own logo already
   * sits exactly where it will finally be.
   *
   * ⚠ `offsetWidth`, not the rect's width, for the scale: the copy is *already*
   * carrying a scale from the previous measurement, and dividing by a scaled
   * width would compound it every time. Centres come off the rects instead,
   * which is safe - a scale about the centre does not move the centre.
   */
  const measure = useCallback(() => {
    const root = rootRef.current;
    const mark = markRef.current;
    if (!root || !mark) return;
    const real = root.querySelector<HTMLElement>(
      `.hero-reveal__box .${HERO_REVEAL_LOGO_CLASS}`,
    );
    if (!real || !mark.offsetWidth || !real.offsetWidth) return;
    const from = mark.getBoundingClientRect();
    const to = real.getBoundingClientRect();
    root.style.setProperty(
      "--hero-reveal-logo-scale",
      String(real.offsetWidth / mark.offsetWidth),
    );
    root.style.setProperty(
      "--hero-reveal-logo-dx",
      `${to.left + to.width / 2 - (from.left + from.width / 2)}px`,
    );
    root.style.setProperty(
      "--hero-reveal-logo-dy",
      `${to.top + to.height / 2 - (from.top + from.height / 2)}px`,
    );
  }, []);

  // Measured before the first paint, then kept current: a logo whose size is
  // intrinsic only settles when the image loads, and both boxes are built on
  // `clamp()`s that move with the viewport. `ResizeObserver` covers the load and
  // the resize alike; `stage` re-runs it so the travel starts from numbers taken
  // at the moment it begins.
  useIsomorphicLayoutEffect(() => {
    if (!enabled || !placeholderLogo) return;
    measure();
    const root = rootRef.current;
    const real = root?.querySelector<HTMLElement>(
      `.hero-reveal__box .${HERO_REVEAL_LOGO_CLASS}`,
    );
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (markRef.current) observer.observe(markRef.current);
    if (real) observer.observe(real);
    return () => observer.disconnect();
  }, [enabled, placeholderLogo, stage, measure]);

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    // Only the box's own opening - the placeholder's mark beside it and the hero
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
        ref={rootRef}
        className={[
          "hero-reveal",
          placeholderLogo ? "hero-reveal--has-mark" : "",
          stage !== "hidden" ? "hero-reveal--revealed" : "",
          stage === "done" ? "hero-reveal--done" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onTransitionEnd={handleTransitionEnd}
        style={{
          // The CSS reads the durations from here, so one number drives the
          // opening, the mark's travel, the delay the text waits out and the
          // safety timer.
          ["--hero-reveal-duration" as string]: `${duration}ms`,
          ["--hero-reveal-content-duration" as string]: `${contentDuration}ms`,
          // The spinner's *box*, not its diameter - `Spinner` is content-box,
          // so its border rings the size rather than fitting inside it, and the
          // counterweight above the mark is built from this. The CSS falls back
          // to 34px, which is not this pair's box: unpublished, the mark sat
          // four pixels above the middle of the space it is meant to centre in.
          ["--hero-reveal-spinner-box" as string]: `${HERO_REVEAL_SPINNER_BOX}px`,
          ...(placeholderHeight
            ? { ["--hero-reveal-reserved" as string]: placeholderHeight }
            : {}),
        }}
      >
        {/* Holds the hero's whole height while the video buffers, with the mark
            centred in it under a light sweep. Out of flow (the reserved height
            is a `min-height` on the wrapper instead), so the opening box starts
            at the wrapper's top edge and the hero's own logo is laid out - and
            can be measured - exactly where it will finally sit.

            ⚠ The **mark** is `aria-hidden` and the box around it is not: the
            mark is a duplicate of markup the hero already carries, while the
            spinner is the one thing in here worth announcing. Hiding the whole
            box - which this used to do - takes the loading status with it. */}
        <div className="hero-reveal__placeholder">
          {placeholderLogo ? (
            <div className="hero-reveal__placeholder-balance" aria-hidden />
          ) : null}
          {placeholderLogo ? (
            <div
              ref={markRef}
              className="hero-reveal__placeholder-logo"
              aria-hidden
            >
              {placeholderLogo}
            </div>
          ) : null}
          {/* Says outright that something is loading, which a mark sitting still
              under a sweep only implies - and it is the **only** such signal
              under `prefers-reduced-motion`, where the sweep is switched off.
              Its leading edge is `--accent`, the tenant's own brand colour on a
              site that publishes one. It goes the moment the reveal starts,
              because that moment *is* the video being ready to play.

              ⚠ It is laid out in flow and must stay that way - a `transform`
              used to position it becomes the implicit start of the spinner's own
              rotation and stops it spinning outright (see `hero-reveal.css`).
              The empty box above the mark is what keeps the mark centred all the
              same; it is rendered only when there is a mark to centre. */}
          <Spinner
            className="hero-reveal__placeholder-spinner"
            size={HERO_REVEAL_SPINNER_SIZE}
            thickness={HERO_REVEAL_SPINNER_THICKNESS}
            label={loadingLabel}
          />
        </div>
        <div ref={boxRef} className="hero-reveal__box">
          <div className="hero-reveal__inner">{children}</div>
        </div>
      </div>
    </HeroRevealContext.Provider>
  );
}

export default HeroReveal;
