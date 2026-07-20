"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@repo/auth/session-provider";
import { useRouter } from "@repo/i18n/navigation";
import { useGuestState } from "@/hooks/use-guest-cart";
import { clearGuestState, hasGuestState } from "@/lib/guest-cart";

/**
 * Folds a guest's localStorage cart and favorites into their account the moment
 * a session appears.
 *
 * Mounted once in the root layout rather than hooked into the login form,
 * because there are several ways to end up signed in - password, passkey, a
 * fresh sign-up, or simply arriving with a valid cookie in another tab - and all
 * of them must merge. Watching for "there is a session *and* there is local
 * state" catches every one of them with no per-path wiring.
 *
 * Renders nothing.
 */
export function GuestMerge() {
  const session = useSession();
  const guest = useGuestState();
  const router = useRouter();
  // One attempt per mount. Without it a failed merge would retry on every
  // re-render, and a successful one could race a second copy of itself while
  // the first request is still in flight.
  const attempted = useRef(false);

  const shouldMerge = session !== null && hasGuestState(guest);

  useEffect(() => {
    if (!shouldMerge || attempted.current) return;
    attempted.current = true;

    const run = async () => {
      try {
        const res = await fetch("/api/auth/guest/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cart: guest.cart,
            favorites: guest.favorites,
          }),
        });

        // Only clear on a confirmed merge. Dropping the local cart after a
        // failure would lose it outright - leaving it lets the next page load
        // try again, and the merge is a union, so re-sending what already
        // landed cannot happen (this only runs when the clear did not).
        if (!res.ok) return;

        clearGuestState();
        // Re-run the server components that own the real cart: the navbar count,
        // the cart page and every card's in-cart state.
        router.refresh();
      } catch {
        // Same reasoning - keep the local state for the next attempt.
      }
    };

    void run();
  }, [shouldMerge, guest.cart, guest.favorites, router]);

  return null;
}
