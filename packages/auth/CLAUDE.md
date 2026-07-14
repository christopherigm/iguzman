# @repo/auth

The auth stack shared by the web frontends (`cinelog`, `edge-folio`, `website`,
`tanda`). Before this package each app had its own near-identical copy, and they
drifted: one had a 1-hour access cookie that contradicted its own proxy, one
dropped the locale on sign-out, two sent password-reset emails to a page that did
not exist. Fix things here, once.

`cli/new-nextjs-app/new-nextjs-app.sh` scaffolds new apps onto this package, so
"Adding an app" below is also what the generator emits. It used to generate a
private copy of all of it - if you change the shape of the wiring here, change
the generator in the same task, or the next `pnpm new-app` reintroduces the drift.

## The core idea: the server owns the session

Identity is **derived on the server from the access-token cookie**, not stored in
the browser.

```
request → proxy.ts (refreshes the token if expired, sets the cookie)
        → layout.tsx: const session = await getSession()   // decode the cookie
        → <SessionProvider session={session}>              // hand it to the client
        → useSession() / useIsLoggedIn() in any client component
```

The apps used to keep a `displayName` in `localStorage` and dispatch an `app-auth`
event. The server cannot read `localStorage`, so every page was server-rendered
**logged-out** and only corrected after hydration - the visible flash, and on a
service-worker-cached page a manual reload was needed to see the truth. There is
now exactly one source of truth and it is readable on both sides.

**Never reintroduce a client-side user store.** If a client component needs to
know who the user is, it calls `useSession()`.

## Invariants that will bite you

**The proxy matcher must be an inline literal in each app.** Next.js statically
analyses `export const config = { matcher: [...] }` at build time. An imported
constant silently fails to parse and the proxy then runs on **every** request,
including `/api/*` - the intl middleware redirects `POST /api/auth/login` to
`/en/api/auth/login` and login breaks. Each `proxy.ts` inlines its own literal.

**The proxy refreshes on every page, not just protected ones.** Public pages render
auth-dependent UI too (a catalog card's edit button, the navbar's account menu).
A public page served with an expired access token would paint logged-out despite a
perfectly good refresh token. The proxy is also the only place during a page render
that may _write_ cookies, which is why the refresh has to happen there and not in
`getSession()`.

**Identity claims are frozen for the life of the refresh token.** SimpleJWT copies
custom claims from the _refresh_ token onto each new access token, so a renamed
user would keep the old name in the navbar for the full 7 days. Any route that
changes an identity claim must call `reissueTokens()` (→ `POST /api/auth/token/reissue/`,
which re-mints both tokens from the live user). The profile `PUT` handlers already do.

**`user_id` arrives as a string.** SimpleJWT serialises it that way; `sessionFromClaims`
coerces it with `Number()`.

**`API_URL` is server-only.** Never `NEXT_PUBLIC_`. The browser talks to the app's own
`/api/*` route handlers, which reach Django server-to-server.

## What lives where

| Module                      | Runs on | Purpose                                                                                                       |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `tokens.ts`                 | server  | Cookie names/options, claim decoding, `refreshTokens`, `Session` type                                         |
| `session.ts`                | server  | `getSession()` - the request's user, `cache()`d per render                                                    |
| `api-fetch.ts`              | server  | `apiFetch` (refresh-and-retry, `allowAnonymous`, 503 on transport failure), `setAuthCookies`, `reissueTokens` |
| `proxy.ts`                  | server  | `createAuthProxy({ protectedPrefixes })` - intl middleware + session upkeep                                   |
| `client.ts`                 | browser | login/logout/signup/passkeys/password-reset/profile - all via the app's `/api/auth/*`                         |
| `session-provider.tsx`      | browser | `SessionProvider`, `useSession`, `useIsLoggedIn`                                                              |
| `use-auth-actions.ts`       | browser | `signOut` / `completeLogin` - both `router.refresh()` so the server re-renders                                |
| `password-policy.ts`        | both    | Browser mirror of the Django validators                                                                       |
| `password-requirements.tsx` | browser | Live rule checklist; reads the shared `PasswordPolicy` messages from `@repo/i18n`                             |
| `auth-form.tsx`             | browser | `AuthForm` - the sign-in / sign-up / reset tabbed form                                                        |
| `account-form.tsx`          | browser | `AccountForm` - the account page: profile + avatar, password, passkeys                                        |
| `reset-password-form.tsx`   | browser | `ResetPasswordForm` - the page a reset email links to                                                         |
| `verify-email.tsx`          | browser | `VerifyEmail` - the page a verification email links to                                                        |
| `auth-message.tsx`          | browser | `ErrorMessage` / `SuccessMessage` - the inline banners those screens show                                     |
| `route-handlers.ts`         | server  | The `/api/auth/*` handlers that are identical in every app                                                    |

## The auth screens are shared too

`AuthForm`, `AccountForm`, `ResetPasswordForm` and `VerifyEmail` used to be copied
into all three apps (~3,300 lines of near-identical TSX, plus three copies of each
stylesheet). They now live here and the apps' pages just render them:

```tsx
// app/[locale]/account/page.tsx
import { AccountForm } from "@repo/auth/account-form";
```

**Copy stays per app.** The components read the app's own `AuthPage`,
`AccountPage`, `ResetPasswordPage` and `VerifyEmailPage` message namespaces, so each
app keeps its own branding (`signUp.subtitle` is the only string that actually
differs). Only `PasswordPolicy` is shared, via `@repo/i18n`.

**The namespace is `AccountPage` everywhere.** website called its own
`MyAccountPage` and drifted: it had no `changePhoto` key and its change-password
section was the only one that dimmed the submit button. Renamed on the way in - a
per-app namespace prop would just have preserved the drift.

**The one behavioural difference is a prop.** `AuthForm` takes `resolveRedirect` -
where to land once the user is authenticated. It is called **once**, the moment
credentials are accepted and before the passkey prompt, and the result is reused by
every path that finishes the login (register a passkey, skip, or straight through).
That is what lets edge-folio send a user with no `job_title` to `/onboarding` while
still reading the profile exactly once. It defaults to `/`, so cinelog and website
render `<AuthForm />` bare from a server component. An app that needs the prop needs
a thin `"use client"` wrapper - a function cannot cross the server/client boundary.

The forms render `/icons/fingerprint.svg` and (on the account page's passkey list)
`/icons/delete-trash-icon.svg`, so an app adopting them needs both files in its
`public/icons/`. `AccountForm` shows the avatar through `next/image`, so the app's
`next.config.js` must allowlist the API host under `images.remotePatterns`.

**`getProfile` / `updateProfile` live in `client.ts`, generic over the profile
type.** Every app hits the same `/api/auth/profile`, but each returns extra fields
(edge-folio the career ones, website `is_admin` / `system_id`), so an app declares
`interface UserProfile extends BaseUserProfile` and binds the generic:

```ts
export function getProfile(): Promise<UserProfile> {
  return getSharedProfile<UserProfile>();
}
```

`getProfile` dedupes concurrent in-flight calls - edge-folio's profile page and its
job-search section both ask on mount, and that used to be two round-trips.

## Route handlers: shared by re-export

A `route.ts` has to live inside an app's `app/` tree, so what gets shared is the
handler function. The five that are identical everywhere are bound in one line:

```ts
// app/api/auth/logout/route.ts
export { logoutRoute as POST } from "@repo/auth/route-handlers";
```

`logoutRoute`, `changePasswordRoute`, `listPasskeyCredentialsRoute`,
`deletePasskeyCredentialRoute`, `uploadProfilePictureRoute`. The rest stay in their
apps because they genuinely differ - website injects `system_id` from the request
host, edge-folio carries extra profile fields.

## Adding an app

1. `"@repo/auth": "workspace:*"` in `package.json`.
2. `proxy.ts`: `createAuthProxy({ protectedPrefixes: [...] })` + an **inline** matcher literal.
3. Root layout: `const session = await getSession()` → `<SessionProvider session={session}>`.
4. `lib/api-fetch.ts`: re-export from `@repo/auth/api-fetch` (route handlers import `@/lib/api-fetch`, per `apps/CLAUDE.md`).
5. The auth screens: render `AuthForm` / `ResetPasswordForm` / `VerifyEmail` from the
   `(auth)` route group and `AccountForm` from `account/`, add the `AuthPage` /
   `AccountPage` / `ResetPasswordPage` / `VerifyEmailPage` namespaces to all five
   `messages/*.json`, and drop `fingerprint.svg` + `delete-trash-icon.svg` into
   `public/icons/`.
6. The five shared `/api/auth/*` route handlers: one-line re-exports (see above).
7. The API's `CustomTokenObtainPairSerializer.get_token` must add the identity claims,
   and its `users/urls.py` must expose `token/reissue/`.
