"use client";

import { AuthForm } from "@repo/auth/auth-form";

/**
 * `AuthForm`, landing the reader back where they were sent from.
 *
 * `next` is set by whatever redirected here - today that is `/orders/[id]`,
 * which sends a signed-out visitor to sign in when the order they hold a link
 * to turns out to belong to an account (see that page's comment). Without it
 * the form's default takes them to the home page, which for someone who arrived
 * from a receipt is a dead end: nothing on the site links back to one order.
 *
 * ⚠ **Only a same-site path is honoured**, and the check is here rather than at
 * the caller because the value ultimately comes out of a URL the visitor can
 * edit. Anything else - an absolute URL, a protocol-relative `//evil.example` -
 * would make the sign-in form an open redirect: the classic phishing shape,
 * where the link the customer is asked to trust is the site's own. A leading `/`
 * that is not `//` is the whole test. The destination stays **locale-less**,
 * like every href in this app: `completeLogin` navigates through the shared
 * router, which applies the prefix.
 *
 * It takes the param as a prop rather than reading `useSearchParams()` itself,
 * so the page needs no `<Suspense>` boundary around it and the form is still in
 * the first HTML.
 */
export function AuthFormWithNext({ next }: { next?: string }) {
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return <AuthForm resolveRedirect={() => safe} />;
}
