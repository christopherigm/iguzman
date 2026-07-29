import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * The locale-aware navigation set. **Every internal link in this monorepo goes
 * through this `Link`** (via `@repo/ui`'s `Box`/`Button`/`IconButton`/
 * `LinkButton`/`Breadcrumbs`/`Navbar`, which all render it), and every
 * programmatic navigation through this `useRouter`.
 *
 * Hrefs are written **locale-less** - `/species/deer`, not `/es/species/deer` -
 * and next-intl prefixes the *current* locale at render time (`useLocale()` on
 * the client, the request locale in a server component). That is what makes a
 * stale locale in a link structurally impossible; hand-interpolating
 * `` `/${locale}/…` `` was merely verbose, but a bare `next/link` on a
 * locale-less href is actively wrong - see below.
 *
 * ⚠ **Never reach for `next/link` or `next/navigation`'s `useRouter` for
 * internal navigation.** A locale-less href on a bare `next/link` has no
 * prefix, so the proxy has to resolve the locale itself, and
 * `resolveLocaleFromPrefix` falls through to the **`NEXT_LOCALE` cookie**
 * (`next-intl/middleware`) when the path carries none. That costs a redirect on
 * every click, wastes the prefetch (the cached payload is the redirect), and
 * hands the decision to a cookie rather than to the page the reader is standing
 * on - so a shared `/fr/…` link opened with `NEXT_LOCALE=en` bounces to `/en`.
 *
 * The same fall-through is why the locale switcher must use *this* `useRouter`:
 * only next-intl's own `Link`/`useRouter` run `syncLocaleCookie`, and its
 * middleware deliberately ignores non-`document` requests (a soft navigation's
 * RSC fetch sends `Sec-Fetch-Dest: empty`), leaving the cookie pointing at the
 * locale the reader just left.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
