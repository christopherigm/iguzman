"use client";

import { useRouter } from "@repo/i18n/navigation";
import { logout } from "./client";

/**
 * Auth transitions that keep the server's view of the session and the rendered
 * UI in step.
 *
 * The important part is the `router.refresh()`. Login and logout change HTTP-only
 * cookies, which only the server can read - so after either one, the currently
 * rendered server components are stale (still showing the old session). The
 * refresh re-runs them against the new cookie and streams down the corrected UI.
 * Without it the navbar keeps showing the previous state until a hard reload,
 * which is exactly the bug this package exists to kill.
 *
 * The router comes from `@repo/i18n/navigation`, so every redirect keeps the
 * active locale prefix.
 */
export function useAuthActions() {
  const router = useRouter();

  return {
    /** Sign out, then re-render as anonymous. */
    signOut: async (redirectTo = "/") => {
      await logout();
      router.replace(redirectTo);
      router.refresh();
    },

    /**
     * Call after a successful login/signup/passkey to land the user and pick up
     * the new session.
     */
    completeLogin: (redirectTo = "/") => {
      router.replace(redirectTo);
      router.refresh();
    },
  };
}
