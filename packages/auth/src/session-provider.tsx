"use client";

import { createContext, useContext } from "react";
import type { Session } from "./tokens";

/**
 * The session, handed down from the server.
 *
 * The value is decoded from the HTTP-only access cookie during the request and
 * passed in by the root layout, so the very first HTML the browser receives
 * already reflects who the user is. This replaces the old localStorage +
 * `app-auth` CustomEvent arrangement, which the server could not read - the
 * server rendered logged-out, the client corrected it after hydration, and the
 * user saw the flash (or, on a cached page, had to reload to see the truth).
 *
 * There is no client-side setter. Login, logout, and profile edits all change
 * cookies on the server, so they finish with `router.refresh()`; the layout
 * re-renders, and a new session value flows down. One direction, one source.
 */
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: Session | null;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

/** The signed-in user, or null when logged out. */
export function useSession(): Session | null {
  return useContext(SessionContext);
}

/**
 * Reactive login state. Use to gate write-only UI in read-only views that
 * anonymous visitors can also see (e.g. the catalog and movie detail page).
 */
export function useIsLoggedIn(): boolean {
  return useContext(SessionContext) !== null;
}

export type { Session };
