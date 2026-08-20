"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Anything a scroll can be aimed at: a CSS selector (`"#booking-heading"`,
 * `'[data-video-uuid="…"]'`), an element, or the ref holding one.
 *
 * `null`/`undefined` are deliberately part of the type so a caller can pass
 * `ref.current` or a lookup that found nothing without a guard of its own - the
 * scroll simply doesn't happen and reports that it didn't.
 */
export type ScrollTarget =
  string | Element | null | undefined | RefObject<Element | null>;

export interface ScrollToOptions {
  /** Where the target lands vertically. Default `"start"`. */
  block?: ScrollLogicalPosition;
  /** Where it lands horizontally. Default `"nearest"`. */
  inline?: ScrollLogicalPosition;
  /**
   * Animate the travel. Default `true` - and **always overridden to instant
   * under `prefers-reduced-motion: reduce`**, which is the reason to call these
   * helpers instead of `scrollIntoView` directly.
   */
  smooth?: boolean;
  /**
   * Announce this scroll as **the app's**, not the reader's, so a bar that
   * hides itself on the way down can leave itself alone during the travel and
   * come back once the page lands. Default `false`.
   *
   * A jump list (a menu's category index, a page's own table of contents) is
   * the case it exists for: pressing an entry scrolls the page *down*, which is
   * exactly the gesture `Navbar` reads as "the reader wants the content, hide
   * the bar" - so the reader arrives where they asked to be with the navigation
   * they were just using swiped off the screen.
   *
   * Turning it on emits the {@link subscribeToProgrammaticScroll} signal; the
   * only listener today is `Navbar`, which suppresses its own hide-on-scroll
   * while the travel is in flight and shows itself when it ends. Anything else
   * that hides on scroll can subscribe to the same signal.
   */
  revealNavbar?: boolean;
}

/** The two ends of one app-driven scroll. See {@link ScrollToOptions.revealNavbar}. */
export type ProgrammaticScrollPhase = "start" | "end";

type ProgrammaticScrollListener = (phase: ProgrammaticScrollPhase) => void;

const programmaticListeners = new Set<ProgrammaticScrollListener>();

/**
 * Listen for scrolls this module started on the app's behalf.
 *
 * `"start"` fires as the travel is kicked off and `"end"` once the page has
 * stopped moving, so a component that reacts to scrolling can tell "the reader
 * scrolled" from "we scrolled the reader" - which are different intentions and
 * deserve different answers.
 *
 * @returns an unsubscribe function, for an effect's cleanup.
 */
export function subscribeToProgrammaticScroll(
  listener: ProgrammaticScrollListener,
): () => void {
  programmaticListeners.add(listener);
  return () => {
    programmaticListeners.delete(listener);
  };
}

function notifyProgrammaticScroll(phase: ProgrammaticScrollPhase): void {
  for (const listener of programmaticListeners) listener(phase);
}

/**
 * How long the page must go without a `scroll` event before the travel counts
 * as finished. Long enough to bridge the gap between two frames of a smooth
 * scroll, short enough that the bar comes back as the page settles.
 */
const SCROLL_SETTLE_QUIET_MS = 120;

/**
 * Ceiling on the whole trip, in case the page never settles - a scroll
 * container that keeps moving under its own momentum, or a reader who takes
 * over mid-travel. The end is announced regardless, since a listener waiting on
 * it must never be left suppressed forever.
 */
const SCROLL_SETTLE_MAX_MS = 2000;

interface SettleState {
  quiet?: ReturnType<typeof setTimeout>;
  cap?: ReturnType<typeof setTimeout>;
  onScroll: () => void;
}

let settling: SettleState | null = null;

/**
 * Announce a scroll as the app's and watch the page until it stops moving.
 *
 * ⚠ **The end is measured, not assumed.** `scrollTo`/`scrollIntoView` return
 * the moment the travel is *scheduled*, and the `scrollend` event is still
 * missing from browsers in use - so the landing is "no `scroll` event for
 * `SCROLL_SETTLE_QUIET_MS`", with a hard cap behind it. A target already in
 * view emits no scroll events at all and simply ends after the quiet period.
 *
 * A second jump before the first has landed extends the same trip rather than
 * opening another - listeners see one `"start"` and one `"end"` either way.
 */
function beginProgrammaticScroll(): void {
  if (typeof window === "undefined") return;

  if (settling) {
    armSettleTimers(settling);
    return;
  }

  settling = {
    onScroll: () => {
      if (settling) armSettleTimers(settling, { quietOnly: true });
    },
  };
  armSettleTimers(settling);
  window.addEventListener("scroll", settling.onScroll, { passive: true });
  notifyProgrammaticScroll("start");
}

function armSettleTimers(
  state: SettleState,
  { quietOnly = false }: { quietOnly?: boolean } = {},
): void {
  clearTimeout(state.quiet);
  state.quiet = setTimeout(endProgrammaticScroll, SCROLL_SETTLE_QUIET_MS);
  if (quietOnly) return;
  clearTimeout(state.cap);
  state.cap = setTimeout(endProgrammaticScroll, SCROLL_SETTLE_MAX_MS);
}

function endProgrammaticScroll(): void {
  if (!settling) return;
  const state = settling;
  settling = null;
  clearTimeout(state.quiet);
  clearTimeout(state.cap);
  window.removeEventListener("scroll", state.onScroll);
  notifyProgrammaticScroll("end");
}

/**
 * True when the reader has asked their OS for less animation.
 *
 * Every scroll in here consults it, so a motion-sensitive reader still arrives
 * at the same place - just without the travel.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Narrows a {@link ScrollTarget} to the element it names, or `null`. */
export function resolveScrollTarget(target: ScrollTarget): Element | null {
  if (!target) return null;
  if (typeof target === "string") {
    if (typeof document === "undefined") return null;
    return document.querySelector(target);
  }
  if (target instanceof Element) return target;
  return target.current ?? null;
}

/**
 * Bring an element into view.
 *
 * **This is the one way anything in `apps/` scrolls to an element.** A bare
 * `scrollIntoView({ behavior: "smooth" })` is animation a reader may have asked
 * not to be shown, and every hand-rolled copy in the monorepo forgot to check;
 * routing them through here means the reduced-motion answer is decided once.
 *
 * The offset for a fixed navbar is the **target's own `scroll-margin-top`**, not
 * an argument here - the element knows what it must clear, and a caller passing
 * a pixel offset would have to know the navbar's height from across the app.
 *
 * @returns whether a target was found and scrolled - so a caller retrying or
 * clearing pending state can tell "not there" from "done".
 *
 * @example
 * scrollToElement("#booking-heading");
 * scrollToElement(listEndRef, { block: "nearest" });
 */
export function scrollToElement(
  target: ScrollTarget,
  {
    block = "start",
    inline = "nearest",
    smooth = true,
    revealNavbar = false,
  }: ScrollToOptions = {},
): boolean {
  const element = resolveScrollTarget(target);
  if (!element) return false;

  // Announced *before* the travel starts, so a listener suppressing itself for
  // the duration is already suppressed by the first scroll event.
  if (revealNavbar) beginProgrammaticScroll();
  element.scrollIntoView({
    behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    block,
    inline,
  });
  return true;
}

/**
 * Scroll the window to an absolute offset - the counterpart of
 * {@link scrollToElement} for the cases with no element to aim at, i.e. a page
 * turn returning to the top and a restored scroll position.
 *
 * A restore should pass `smooth: false`: it is putting the reader back where
 * they were, not travelling somewhere new, and animating it makes a returning
 * page look like it scrolled itself.
 */
export function scrollWindowTo(
  top: number,
  {
    smooth = true,
    revealNavbar = false,
  }: Pick<ScrollToOptions, "smooth" | "revealNavbar"> = {},
): void {
  if (typeof window === "undefined") return;
  if (revealNavbar) beginProgrammaticScroll();
  window.scrollTo({
    top,
    behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
  });
}

/** Ease back to the top of the page. `scrollWindowTo(0)`, named. */
export function scrollToTop(
  options?: Pick<ScrollToOptions, "smooth" | "revealNavbar">,
): void {
  scrollWindowTo(0, options);
}

export interface ScrollToProps extends ScrollToOptions {
  /** What to bring into view - usually a selector for an `id` on the heading. */
  target: ScrollTarget;
  /**
   * Only scroll a page that is still at the very top. Default `true`.
   *
   * A page that is *not* at the top was put there by the reader (the back
   * button, a reload restoring their position), and moving it would throw away
   * their place. Pass `false` only when the scroll must win regardless.
   */
  onlyWhenAtTop?: boolean;
}

/** How far down the page still counts as "at the top", in pixels. */
const AT_TOP_SLACK = 4;

/**
 * Scrolls to `target` once, on arrival - the declarative form of
 * {@link scrollToElement}, for a page that should open somewhere other than its
 * own top.
 *
 * The case it was written for: a checkout is somewhere the customer arrived to
 * *do* something, having already seen the item on its detail page. The hero is
 * there so they can confirm they are booking what they meant to, not so they
 * have to scroll past it first - so the page opens on the form and leaves the
 * hero above it.
 *
 * Renders nothing. It deliberately does not move a page that is not at the top
 * (see `onlyWhenAtTop`) and does not animate under `prefers-reduced-motion`.
 *
 * ⚠ **It waits one frame before scrolling.** The hero above the target has to
 * be laid out first, or a smooth scroll aimed at a pre-layout position lands
 * short of it.
 *
 * @example
 * <ScrollTo target="#booking-heading" />
 */
export function ScrollTo({
  target,
  onlyWhenAtTop = true,
  block = "start",
  inline = "nearest",
  smooth = true,
  revealNavbar = false,
}: ScrollToProps) {
  useEffect(() => {
    if (onlyWhenAtTop && window.scrollY > AT_TOP_SLACK) return;

    const frame = requestAnimationFrame(() => {
      scrollToElement(target, { block, inline, smooth, revealNavbar });
    });

    return () => cancelAnimationFrame(frame);
  }, [target, onlyWhenAtTop, block, inline, smooth, revealNavbar]);

  return null;
}

export default ScrollTo;
