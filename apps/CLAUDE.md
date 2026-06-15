# Next.js App Conventions

These rules apply to every Next.js app in `apps/`.

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

## Link Convention

- **Always use `Link` from `next/link` with the `prefetch` attribute** for internal navigation links instead of raw `<a>` tags.
- Reserve `<a>` for external links (opening in a new tab or pointing to an external domain).

```tsx
// Internal
import Link from 'next/link';
<Link href="/about" prefetch>About</Link>

// External
<a href="https://example.com" target="_blank" rel="noopener noreferrer">External</a>
```

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
} /* body-sm / 14 px */
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

```ts
// proxy.ts
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@repo/i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  // auth guard or other logic here, then:
  return intlMiddleware(request);
}

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

## TypeScript - CSS Module Declarations

Each app includes a `css.d.ts` file at its root for ambient module declarations for CSS subpath imports that TypeScript cannot resolve (e.g. `swiper/css`):

```ts
declare module "swiper/css";
declare module "swiper/css/*";
```

**Rule:** If you add a new CSS side-effect import from a third-party package and TypeScript raises TS2882, add a `declare module` entry to the app's `css.d.ts`. Never create a separate per-package `.d.ts` file - `css.d.ts` is the single place for these declarations.
