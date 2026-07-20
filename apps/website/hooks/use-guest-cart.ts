"use client";

import { useSyncExternalStore } from "react";
import {
  getGuestServerSnapshot,
  getGuestSnapshot,
  subscribeGuestState,
  type GuestState,
} from "@/lib/guest-cart";

/**
 * The anonymous visitor's cart and favorites, kept in step across every
 * component that shows them.
 *
 * `useSyncExternalStore` rather than state-plus-effect: localStorage genuinely
 * *is* an external store, and this is the one hook that reads it without
 * setting state during an effect (which the repo's react-hooks rules reject,
 * and which would double-render every card in a grid).
 *
 * The server snapshot is empty, so the HTML a logged-out visitor is sent shows
 * no cart and hydration matches it; the subscription then paints the real state
 * on the client. That one-frame gap is the unavoidable cost of a cart the server
 * cannot see - and it only affects logged-out visitors, since a signed-in cart
 * still renders from the server on the first byte.
 */
export function useGuestState(): GuestState {
  return useSyncExternalStore(
    subscribeGuestState,
    getGuestSnapshot,
    getGuestServerSnapshot,
  );
}
