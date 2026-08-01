"use client";

import { useEffect } from "react";

/**
 * Freeze the page behind an overlay - a modal, a fullscreen viewer, a drawer -
 * for as long as `active` is true.
 *
 * ⚠ **It locks `<html>`, not just `<body>`, and that is the whole reason this
 * hook exists.** Every app in `apps/` sets `html, body { overflow-x: hidden }`
 * in its `globals.css`, and once the root element's overflow is anything other
 * than `visible` the CSS spec stops propagating the body's overflow to the
 * viewport - `<html>` becomes the scroll container. So the
 * `document.body.style.overflow = 'hidden'` that `ConfirmationModal` (and the
 * drawer, and the map's fullscreen) each carried was a no-op in every one of
 * those apps: the dialog opened and the page went on scrolling behind it. Don't
 * "simplify" this back to the body alone.
 *
 * On a touchscreen the same unlocked page is also what eats a pinch: the
 * browser pans the document with the two fingers that were meant to zoom the
 * photograph underneath. Locking is half the fix - the overlay that wants the
 * gesture must also claim it with `touch-action: none`, which this hook
 * deliberately does **not** set globally: an ancestor with `touch-action: none`
 * would also kill finger-scrolling inside a modal's own scrollable panel.
 *
 * **The lock is reference-counted**, because overlays stack - a confirmation
 * dialog opened from inside a drawer, a fullscreen map behind a modal. The
 * first lock records the inline styles it displaced and the last release puts
 * them back; the ones in between neither re-record nor restore, so the reader
 * never gets a page that started scrolling again while a dialog was still open.
 * (It also makes React's development double-invoked effects a no-op, since
 * their mount/unmount pairs balance.)
 *
 * The scrollbar it hides is compensated with padding on `<body>`, so the page
 * doesn't jump sideways as the dialog opens. The same width is published as
 * `--ui-scroll-lock-gutter` on `<html>` for anything an app pins outside the
 * body flow (a `position: fixed` navbar), and is `0px` while unlocked.
 *
 * @example
 * useScrollLock();                        // locked for this component's life
 * useScrollLock(fullscreenIndex !== null); // locked while the viewer is open
 */
export function useScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active]);
}

/** How many overlays currently hold the lock. */
let lockCount = 0;

/** Undoes what the *first* lock changed; null whenever `lockCount` is 0. */
let restore: (() => void) | null = null;

const GUTTER_VAR = "--ui-scroll-lock-gutter";

function acquire(): void {
  if (typeof document === "undefined") return;
  if (lockCount++ > 0) return;

  const html = document.documentElement;
  const { body } = document;
  const previousHtmlOverflow = html.style.overflow;
  const previousBodyOverflow = body.style.overflow;
  const previousBodyPaddingRight = body.style.paddingRight;

  // Measured before anything is hidden - afterwards the scrollbar is gone and
  // the gap reads as 0. `clientWidth` already excludes it, so the difference is
  // exactly the width about to be reclaimed (0 on overlay-scrollbar platforms).
  const gutter = window.innerWidth - html.clientWidth;

  html.style.overflow = "hidden";
  body.style.overflow = "hidden";

  if (gutter > 0) {
    const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + gutter}px`;
    html.style.setProperty(GUTTER_VAR, `${gutter}px`);
  }

  restore = () => {
    html.style.overflow = previousHtmlOverflow;
    body.style.overflow = previousBodyOverflow;
    body.style.paddingRight = previousBodyPaddingRight;
    html.style.setProperty(GUTTER_VAR, "0px");
  };
}

function release(): void {
  if (lockCount === 0) return;
  if (--lockCount > 0) return;
  restore?.();
  restore = null;
}

export default useScrollLock;
