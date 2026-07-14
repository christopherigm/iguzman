"use client";

import { AuthForm } from "@repo/auth/auth-form";
import { getProfile } from "@/lib/auth";

/**
 * The shared form, plus the one thing that is edge-folio's own: a user who has
 * not set a job title yet still has to go through onboarding. `job_title` is too
 * volatile for a token claim, so deciding this needs a profile read - which the
 * form performs exactly once, whichever way the login finishes.
 */
export function EdgeFolioAuthForm() {
  return (
    <AuthForm
      resolveRedirect={async () =>
        (await getProfile()).job_title ? "/" : "/onboarding"
      }
    />
  );
}
