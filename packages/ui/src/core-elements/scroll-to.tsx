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
  { block = "start", inline = "nearest", smooth = true }: ScrollToOptions = {},
): boolean {
  const element = resolveScrollTarget(target);
  if (!element) return false;

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
  { smooth = true }: { smooth?: boolean } = {},
): void {
  if (typeof window === "undefined") return;
  window.scrollTo({
    top,
    behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
  });
}

/** Ease back to the top of the page. `scrollWindowTo(0)`, named. */
export function scrollToTop(options?: { smooth?: boolean }): void {
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
}: ScrollToProps) {
  useEffect(() => {
    if (onlyWhenAtTop && window.scrollY > AT_TOP_SLACK) return;

    const frame = requestAnimationFrame(() => {
      scrollToElement(target, { block, inline, smooth });
    });

    return () => cancelAnimationFrame(frame);
  }, [target, onlyWhenAtTop, block, inline, smooth]);

  return null;
}

export default ScrollTo;
