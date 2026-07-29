# Next.js App Conventions

These rules apply to every Next.js app in `apps/`.

## File & Folder Structure

Every Next.js app in `apps/` follows the same layout so files land in predictable places regardless of which app you open. The guiding principle: **keep a component as close as possible to the route that uses it, and only lift it out when a second route needs it.**

### Where each kind of file goes

| Kind                                       | Location                                   | Rule                                                                                                                          |
| ------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Component used by **exactly one route**    | Loose file next to that route's `page.tsx` | Default. No wrapper folder. `movies/[slug]/movie-detail.tsx`                                                                  |
| One route with **many** local components   | `_components/` folder inside that route    | Only once a route owns **~4+** local components and the folder is getting noisy. Promote the loose files into `_components/`. |
| Component **shared by 2+ routes**          | `components/` at the app root              | Group related shared components in a subfolder: `components/<domain>/` (e.g. `components/movie-catalog/`).                    |
| Hook used by **exactly one route**         | Loose file next to that route's `page.tsx` | Same rule as components. If the route uses `_components/`, a matching `_hooks/` is acceptable but not required.               |
| Hook **shared by 2+ routes**               | `hooks/` at the app root                   | All reusable hooks live here. Never scatter `use-*` files into `lib/`.                                                        |
| Pure utilities, data-fetching, API clients | `lib/` at the app root                     | Non-hook, non-component modules only. Keep it free of `use-*` hooks and JSX components.                                       |

### The two thresholds

1. **Loose → `_components/`:** a component starts life as a loose file beside `page.tsx`. Move it into a route-local `_components/` folder **only** when that route accumulates roughly four or more local components. Don't create `_components/` pre-emptively for one file — the extra folder just deepens an already-long App Router path (route groups + dynamic segments).
2. **Route-local → `components/`:** the moment a second route imports a component, lift it to `components/<domain>/`. Colocation is for single-consumer code only.

**Don't split a route between the root and `_components/`.** Once a route has crossed the threshold and uses a `_components/` folder, put _all_ of that route's single-use components inside it — the only file that stays loose beside `page.tsx` is the route's main view (the component `page.tsx` renders directly). Mixing a few loose components alongside a `_components/` folder in the same route is the exact inconsistency this convention exists to prevent.

### Rationale

App Router paths are already deep (`app/[locale]/(dashboard)/applications/[id]/`). Wrapping every single-use file in a `_components/` subfolder on top of that makes files hard to find. Loose-by-default keeps the common case one `ls` from the `page.tsx` that uses it, while the `_components/` escape hatch keeps genuinely crowded routes tidy. One home per concern (`components/`, `hooks/`, `lib/`) removes the "where does this go?" guesswork.

## Accessibility - Form Element Labels

Every `<input>`, `<select>`, and `<textarea>` element must have an accessible label. The ESLint `jsx-a11y` rules enforce this as an error (`--max-warnings 0`).

**Required:** one of the following must be present on every form element:

| Method                                  | When to use                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `aria-label="..."`                      | Element is visually labelled by adjacent text but has no programmatic association                          |
| `aria-labelledby="id"`                  | A separate element already in the DOM provides the label text                                              |
| `id` paired with `<label htmlFor="id">` | Standard HTML label association                                                                            |
| `aria-hidden="true"`                    | Element is purely decorative / programmatically triggered (e.g. a hidden file input triggered by a button) |

```tsx
<input type="range" aria-label={t('mySliderLabel')} ... />
<input type="file" aria-hidden="true" ... />
<select aria-label={t('mySelectLabel')} ... />
```

**Rule:** if a `<Typography>` or plain text immediately precedes or follows the control, reuse its translation key as the `aria-label` value - never hardcode strings.

## Styling - Native Form Elements (dark-mode safety)

Every `<select>`, `<input>`, and `<textarea>` that receives custom background or text styling **must** include all three properties together:

```css
background: var(--surface-2);
color: var(--foreground);
color-scheme: light dark;
```

**Why all three are required:**

- `background` + `color` must always travel as a pair - setting one without the other leaves the other value at the browser's OS-theme default, which can produce unreadable combinations (e.g. light text on a white background in dark mode).
- `color-scheme: light dark` tells the browser to render the native dropdown chrome - including `<option>` items, scrollbars, and autocomplete suggestions, which are outside CSS reach - matching the current OS/app theme. Without it, the OS dark theme bleeds into native controls even when `background` and `color` are set.

**Token to use:** always use `--surface-2` (defined in every palette for both light and dark). Never use `--surface-0` - it does not exist in the palette system and will silently fall back to whatever hardcoded default you provide, breaking dark mode.

**Never comment out only `background` or only `color`** as a workaround - remove both or keep both.

## i18n - Static Text

All static text **must** use `next-intl` translations. Never hardcode user-visible strings directly in JSX.

- In server components, use `getTranslations('Namespace')` from `next-intl/server`.
- In client components, use `useTranslations('Namespace')` from `next-intl`.
- Add the key to **all** locale files under the app's `messages/` directory (`en.json`, `es.json`, `de.json`, `fr.json`, `pt.json`) in the same task.
- Text that comes from the API is exempt - it is already locale-aware at the data layer.

## Image Convention

- **Always use `<Image>` from `next/image`** instead of bare `<img>` tags.
- For images that fill their parent container, use the `fill` prop - the parent must have `position: relative`, defined dimensions, and `overflow: hidden`.
- For images with known fixed dimensions, use explicit `width` and `height` props.
- **Before using `<Image>` with external URLs**, allowlist the hostname in `next.config.js` under `images.remotePatterns`.

```js
// next.config.js
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'your-api-domain.com' },
  ],
},
```

## Link Convention - locale-less hrefs through `@repo/i18n/navigation`

- **Always use `Link` from `@repo/i18n/navigation` with the `prefetch` attribute** for internal navigation. **Never `next/link`.**
- **Write the href locale-less** - `/species/deer`, never `` `/${locale}/species/deer` ``. next-intl prefixes the locale being rendered (`useLocale()` on the client, the request locale in a server component).
- The same module owns `useRouter`, `redirect`, `usePathname` and `getPathname`. Reserve `next/navigation` for the locale-agnostic exports (`notFound`, `useSearchParams`, `unstable_rethrow`).
- Reserve `<a>` for external links (opening in a new tab or pointing to an external domain). An absolute or external href passed to `Link` is left untouched.

```tsx
// Internal
import { Link } from "@repo/i18n/navigation";
<Link href="/about" prefetch>
  About
</Link>;

// Programmatic
import { useRouter } from "@repo/i18n/navigation";
router.replace("/orders"); // current locale
router.replace(pathname, { locale }); // switching locale

// Server component redirect - this one takes an object
import { redirect } from "@repo/i18n/navigation";
redirect({ href: "/auth", locale });

// External
<a href="https://example.com" target="_blank" rel="noopener noreferrer">
  External
</a>;
```

⚠ **Why not just `next/link` with a locale-less href, letting the proxy sort it out?**
Because the proxy resolves an unprefixed path from the **`NEXT_LOCALE` cookie**
(`resolveLocaleFromPrefix` prio 2), not from the page the reader is on. That costs a
redirect on every click, wastes the prefetch (the cached payload is the redirect), and
sends a reader who opened a shared `/fr/…` link with `NEXT_LOCALE=en` to `/en`.

⚠ **And it is why the locale switcher must use _this_ `useRouter`.** Only next-intl's
own `Link`/`useRouter` run `syncLocaleCookie`, and its middleware deliberately skips
any request whose `Sec-Fetch-Dest` is not `document` - which a soft navigation's RSC
fetch never is. `@repo/ui`'s `LocaleSwitcher` used to rewrite path segment 1 by hand
and `router.push` it, so the URL became `/es` while the cookie stayed `en`, and every
locale-less link on the page then bounced the reader back to `/en`.

**Two things still keep an explicit locale**, and must not be "fixed":

| What                                          | Why                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Canonical / OG / `metadataBase` absolute URLs | They are addresses for crawlers, not in-app navigation                      |
| A raw `window.open` / `window.location.href`  | Nothing prefixes them - build the path with `getPathname({ href, locale })` |

**Never hand-interpolate the prefix** even in those two cases - `getPathname` is the
one place that knows the routing config.

## Typography - Font Size Rule

**Never write `font-size` in a CSS class that is attached to a `<Typography>`, `<Box>`, `<Button>`, or any other `@repo/ui` component.** The Typography `variant` prop owns sizing for all text rendered through those components.

- Pick the variant whose native size matches your intent - see the scale table in `packages/ui/CLAUDE.md` → "Typography Scale - Size Reference".
- Remove any `styles={{ fontSize: X }}` that duplicates the variant's own size.
- The **only** valid `styles={{ fontSize }}` override is for sub-scale sizes (e.g. 11 px) that have no matching variant; use `variant="label"` as the base and add a brief inline comment.

For **native form elements** (`<select>`, `<input>`, `<textarea>`) where `<Typography>` cannot be used, `font-size` in CSS is acceptable but must use rem values from the scale:

```css
/* ✓ correct - rem values aligned to Typography scale */
.my-select {
  font-size: 0.875rem;
} /* h6 / 14 px */
.my-textarea {
  font-size: 0.8125rem;
} /* caption / 13 px */
.my-label-btn {
  font-size: 0.75rem;
} /* label / 12 px */

/* ✗ wrong - raw px fights the Typography system */
.my-select {
  font-size: 14px;
}
```

## Next.js Proxy (i18n + Auth Middleware)

Next.js 16 renamed `middleware.ts` to `proxy.ts`. Use `proxy.ts` at the app root - never `middleware.ts`.

Apps with auth (`cinelog`, `edge-folio`, `website`, `tanda`, and anything from
`pnpm new-app`) use the shared factory from
`@repo/auth`, which combines the next-intl middleware with JWT session upkeep
(it refreshes an expired access token on every page request, so public pages also
render logged-in). See `packages/auth/CLAUDE.md`.

```ts
// proxy.ts
import { createAuthProxy } from "@repo/auth/proxy";

export default createAuthProxy({
  protectedPrefixes: ["/account", "/admin"],
});

// The matcher MUST be an inline literal. Next.js statically analyses it at build
// time; an imported constant silently fails to parse, the proxy then runs on
// /api/* too, and the intl middleware redirects POST /api/auth/login to
// /en/api/auth/login - breaking login.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
```

An app with no auth uses the intl middleware directly:

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "@repo/i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
```

## API Route Handlers - JWT Token Refresh

Every Route Handler that calls the Django API **must** use `apiFetch` from `@/lib/api-fetch`. Never manually read `access_token` from cookies and call Django directly.

**Why:** `apiFetch` automatically retries the request with a refreshed access token when Django returns 401 (expired token). Manual cookie reads bypass this, causing silent 401 failures in the browser when the access token expires mid-session.

```ts
// ✓ correct - apiFetch handles refresh-and-retry automatically
import { apiFetch } from "@/lib/api-fetch";

export async function GET() {
  const res = await apiFetch("/api/my-resource/", { cache: "no-store" });
  return NextResponse.json(await res.json(), { status: res.status });
}

// ✗ wrong - bypasses refresh logic; Django 401 propagates straight to the browser
import { cookies } from "next/headers";

export async function GET() {
  const token = (await cookies()).get("access_token")?.value;
  if (!token)
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const res = await fetch(`${process.env.API_URL}/api/my-resource/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

**Exception - routes that verify auth but call external services (not Django):** import and call `refreshAccessToken` from `@/lib/api-fetch` when verification fails before returning 401, so a stale access token triggers a refresh rather than a hard logout.

```ts
import { refreshAccessToken } from "@/lib/api-fetch";

// inside the handler, after a failed token verification:
const refreshed = await refreshAccessToken();
if (!refreshed)
  return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
// proceed
```

**Exception - login, signup, logout, verify-email, password-reset, passkey authentication:** these don't need a valid access token to begin with, so direct `fetch` to Django is fine.

## Caching - cache in Django, never in Next

**Every `fetch` to a Django API must be `{ cache: 'no-store' }`. Never write `next: { revalidate: N }`, `cache: 'force-cache'`, or an `unstable_cache` wrapper around an API read, and never add a per-app "cache options" helper.**

The caching for this monorepo lives in **one** place: each Django API's own response cache (Redis in production), whose `signals.py` receivers clear the right namespace the moment a row is written. That cache is correct because it _knows about the write_.

Next's data cache sits above it and does not. It keys on the request and holds the payload for the full revalidate window no matter what the CMS just saved, so a second cache buys nothing a warm Redis wasn't already giving you and costs an author up to `N` seconds of "did my save work?". It is also **per pod** and **on disk** (`.next/cache/fetch-cache/`), so it survives a browser hard-reload, differs between replicas, and cannot be cleared from the CMS.

This is not hypothetical: `apps/animals` shipped a `lib/fetch-cache.ts` returning `{ next: { revalidate: 300 } }`, which made a primary colour changed in `/admin` take five minutes to appear, while `apps/website` - which never cached in Next - applied the same edit on the next request.

```ts
// ✓ correct - one cache, in Django, invalidated on write
const res = await fetch(`${API_URL}/api/system/`, { cache: "no-store" });

// ✗ wrong - a second cache that no write can reach
const res = await fetch(`${API_URL}/api/system/`, {
  next: { revalidate: 300 },
});
```

Wrap a read in React's `cache()` freely - that only dedupes repeated calls **within a single render** and holds nothing between requests, which is the deduplication you want. If a payload ever genuinely needs caching in Next, it needs a `tags:` entry _and_ a `revalidateTag` call on the write path in the same task - otherwise don't.

## TypeScript - CSS Module Declarations

Each app includes a `css.d.ts` file at its root for ambient module declarations for CSS subpath imports that TypeScript cannot resolve (e.g. `swiper/css`):

```ts
declare module "swiper/css";
declare module "swiper/css/*";
```

**Rule:** If you add a new CSS side-effect import from a third-party package and TypeScript raises TS2882, add a `declare module` entry to the app's `css.d.ts`. Never create a separate per-package `.d.ts` file - `css.d.ts` is the single place for these declarations.

## Two-column layouts - split at `sm`, not `md`

**A two-column `Grid` layout should go two-up from the `sm` breakpoint, not `md`** - stacking a pairing across the whole tablet band wastes the horizontal space. Use the `Grid` `size` prop (props-first; it reads the shared `BREAKPOINTS` scale):

- **Even split** (media/text, sibling card pairs): `size={{ xs: 12, sm: 6 }}`.
- **Asymmetric split** (wide main column + narrower sidebar/summary): `size={{ xs: 12, sm: 7 }}` / `size={{ xs: 12, sm: 5 }}` - never `md: 8` / `md: 4`.

Only drop to a `md` split when the columns genuinely can't share a tablet width (very wide fixed content, a table that would overflow) - and say why in a comment. `apps/website/CLAUDE.md` → "Two-column media/text layouts" carries the full rationale and the reference files to copy.

## Responsive breakpoints in CSS (`@custom-media`)

**Never hardcode a breakpoint pixel value in a `@media` query.** The scale lives once
in `@repo/ui`'s `BREAKPOINTS` (`packages/ui/src/core-elements/breakpoints.ts` - a
deliberately React-free module so build scripts can import it), and **every** Next.js
app in `apps/` consumes it through PostCSS `@custom-media` tokens. The tokens are
generated **once, in `@repo/ui`** (not per-app), and every app points at that one file:

- `packages/ui/scripts/gen-breakpoints-css.ts` reads `BREAKPOINTS` and writes
  `packages/ui/src/core-elements/breakpoints.generated.css` (committed; **never edit by
  hand**) - the ONE generated tokens file for the whole monorepo. Regenerate with
  `pnpm --filter @repo/ui gen:breakpoints`; each app's `predev`/`prebuild` delegates to
  it via a `gen:breakpoints` alias, so a changed scale flows into every app's CSS
  automatically. If you change `BREAKPOINTS`, regenerate and re-commit that single file.
- Each app's `postcss.config.mjs` wires two plugins: `@csstools/postcss-global-data`
  (pointed at `../../packages/ui/src/core-elements/breakpoints.generated.css`) injects
  the shared `@custom-media` rules into every CSS file the app bundles - including CSS
  from `@repo/ui` - then `postcss-custom-media` resolves them. Defining this config opts
  the app out of Next's built-in PostCSS, so `autoprefixer` is listed explicitly - keep
  it. `@repo/ui` also carries a reference `postcss.config.mjs` (for standalone tooling;
  it does not run during app builds, which use the app-root config).
- In any `.css` file, write the token, not the pixels:

  ```css
  @media (--below-sm) { … }   /* below the sm breakpoint (mobile only) */
  @media (--md)       { … }   /* from md up */
  @media (--only-lg)  { … }   /* within the lg band only */
  ```

  Available tokens (generated): `--sm`/`--md`/`--lg`/`--xl` (min-width, "from X up"),
  `--below-sm`…`--below-xl` (max-width, "under X"), and `--only-xs`…`--only-xl` (single
  band). An off-scale value (e.g. an old `768px`) snaps to the nearest token
  (`--below-md`) rather than staying a literal - the scale is the single source of truth.

For `@repo/ui` **components** (`Grid`, etc.), still prefer props over CSS - e.g.
`Grid`'s `hidden={{ xs: true }}` hides at a breakpoint with no media query at all,
and `Grid`'s `reorder={{ xs: "last" }}` pushes a grid item to the end (`"last"`,
`order:1`) or start (`"first"`, `order:-1`) of the flex container **within that
breakpoint's band only** - so a cell can lead the layout on desktop yet drop below
its siblings on mobile without a hand-written `order` media query (it's the
range-scoped ordering counterpart to `hidden`, and resets to the authored order
outside the named bands). `@custom-media` is for the CSS that genuinely needs a
media query. `apps/website`'s `CLAUDE.md` carries a longer version of this note;
the mechanism is identical everywhere.
