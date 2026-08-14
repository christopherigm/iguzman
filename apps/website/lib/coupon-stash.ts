/**
 * Carrying a scanned coupon code from the landing page to the cart.
 *
 * Someone scans a poster, lands on `/coupon/SUMMER20`, and taps "Start
 * shopping". The code has to survive that navigation and every page in between,
 * and be waiting in the cart's coupon box when they finally get there.
 *
 * ⚠ **A URL param would be the wrong mechanism**, and this is the same call
 * `apps/cinelog` made for its AI search. A `?coupon=` param has to be threaded
 * through every link between the landing and the cart to survive - and the one
 * link that forgets loses it - while also making the code part of every URL the
 * customer might share, so a private offer travels with any page they send on.
 * `sessionStorage` follows the tab instead of the URL, which is exactly the
 * scope of "this visit, started by this scan".
 *
 * `sessionStorage`, not `localStorage`, deliberately: the cart persists for
 * weeks because a customer means to come back to it, but a coupon they scanned
 * and abandoned should not surface again in a month attached to a basket they
 * built for another reason.
 *
 * Nothing here is authoritative. A stashed code is only ever a *suggestion* the
 * coupon box then validates against the API - the browser is no more trusted
 * about a discount than it is about a price.
 */

const STASH_KEY = "website:pending-coupon";

/** Remember a scanned code for the rest of this tab's visit. */
export function stashCoupon(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STASH_KEY, code);
  } catch {
    // Private mode, a full quota, or storage disabled outright. The customer can
    // still type the code in - which is why nothing downstream may assume this
    // worked.
  }
}

/** The code waiting from a scan, or null. */
export function readStashedCoupon(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STASH_KEY);
  } catch {
    return null;
  }
}

/**
 * Forget the stashed code.
 *
 * Called after the coupon box has *attempted* it, whether or not it applied - an
 * expired code that stayed stashed would re-fail on every cart visit for the
 * rest of the session, with an error the customer has already read and cannot
 * do anything about.
 */
export function clearStashedCoupon(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STASH_KEY);
  } catch {
    /* nothing to clear */
  }
}
