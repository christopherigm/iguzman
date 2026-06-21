"use client";

import { useSyncExternalStore } from "react";
import { getStoredUser } from "@/lib/auth";

// Login/logout dispatch `app-auth`, so re-read the snapshot whenever it fires.
function subscribe(callback: () => void): () => void {
  window.addEventListener("app-auth", callback);
  return () => window.removeEventListener("app-auth", callback);
}

// Client snapshot reads the stored profile; the server has no localStorage so
// it reports logged-out, matching the first client render (no hydration gap).
const getSnapshot = (): boolean => getStoredUser() !== null;
const getServerSnapshot = (): boolean => false;

/**
 * Reactive client-side login state, kept in sync with the stored user profile.
 * Use to gate write-only UI in read-only views that anonymous visitors can also
 * see (e.g. the catalog and movie detail page).
 */
export function useIsLoggedIn(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
