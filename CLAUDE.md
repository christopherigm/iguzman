# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands are run from the repo root using `pnpm`.

```bash
# Development
pnpm dev                    # Start all apps in dev mode
pnpm dev --filter=video-downloader  # Start a single app

# Building
pnpm build                  # Build all packages and apps
pnpm build --filter=web     # Build a single app

# Linting & Type Checking
pnpm lint                   # ESLint across all packages (max-warnings 0)
pnpm check-types            # TypeScript type checking across all packages
pnpm format                 # Prettier format all .ts/.tsx/.md files

# Deployment
pnpm docker                 # Build Docker images
pnpm helm                   # Deploy to Kubernetes via Helm
pnpm deploy-app             # Deploy a specific application
```

Each app runs on port 3000 locally. To run a specific app, use Turborepo filter syntax:

```bash
pnpm dev --filter=apps/video-downloader
```

## Architecture

This is a **Turborepo monorepo** with three Next.js applications and shared packages.

### Apps (`apps/`)

- **web** — General-purpose Next.js app
- **website** — Marketing/public-facing Next.js app with catalog, success stories, and highlights sections
- **horoscope** — Next.js app
- **video-downloader** — The most actively maintained app; client-side video editing using FFmpeg WASM. Requires `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers (already configured in `next.config.ts`) for SharedArrayBuffer support
- **website-api** — Django REST API backend for the website app

### Packages (`packages/`)

- **`@repo/helpers`** — Core utility library (~9k lines). Contains video processing (concat, audio/subtitle/image composition), data validation, and audio manipulation. Each utility is documented with a companion `.md` file
- **`@repo/ui`** — Shared React components, theme providers, palette system, and the `use-ffmpeg` hook for FFmpeg WASM integration
- **`@repo/i18n`** — `next-intl` routing and config for multi-locale support
- **`@repo/eslint-config`** — Shared flat ESLint config (Next.js variant)
- **`@repo/typescript-config`** — Shared `tsconfig` base (ESM, strict, ES2022)
- **`packages/charts`** — Helm charts for Kubernetes deployment

### Key Component Architecture

`VideoItem` is the main card component. Its logic is split across two hooks:

- `use-video-processing.ts` — FFmpeg queue, `checkBars`, `cropString` state, all media processing handlers. Accepts `t` (translation fn) to set error messages.
- `use-video-download.ts` — download trigger, SSE-based task polling, all resume effects on mount.

`use-ffmpeg.ts` (in `@repo/ui`) offloads all FFmpeg WASM operations to a dedicated Web Worker (`ffmpeg-worker.ts`). `removeBlackBars` accepts an optional pre-computed `cropString` to skip the `cropdetect` pass when bars were already detected.

The download polling uses **Server-Sent Events** (`/api/download-video/[id]/stream`) instead of interval polling. `use-poll-task.ts` uses `EventSource` to receive push updates.

Filter state in `VideoGrid` is stored in URL search params (`?platform=`, `?status=`, `?audio=`, `?per=`, `?page=`), making filters bookmarkable/shareable.

### `@repo/ui` Component Library — Use These First

**Rule:** When writing UI code in any Next.js app in `apps/`, always prefer `@repo/ui` components over raw HTML elements or one-off implementations. Import from `@repo/ui`.

#### `UIComponentProps` — shared layout props (all core-elements accept these)

Most components extend `UIComponentProps`, which maps common CSS properties directly to props:
`display`, `flexDirection`, `justifyContent`, `alignItems`, `flexWrap`, `flexGrow`, `gap`, `flex`, `alignSelf`, `order`, `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `padding`, `margin`, `marginTop`, `marginBottom`, `marginLeft`, `marginRight`, `marginInlineStart`, `marginInlineEnd`, `border`, `borderRadius`, `color`, `backgroundColor`, `shadow` (bool), `elevation` (number), `styles` (CSSProperties override), `className`, `id`, `children`.

#### Core Elements (`packages/ui/src/core-elements/`)

| Use case | Component | Key props |
|---|---|---|
| Headings, body text, labels | `Typography` | `variant?: 'none'\|'h1'…'h6'\|'body'\|'body-sm'\|'caption'\|'label'`, `as?` (HTML element override), `textAlign?`, `fontWeight?`, `role?` + UIComponentProps. Use `variant="none"` when a CSS class already defines all typography for an element. |
| Generic `<div>` wrapper | `Box` | All `UIComponentProps` |
| Centered max-width section | `Container` | `size?: 'xs'\|'sm'\|'md'\|'lg'\|'xl'`, `paddingX?` |
| 12-col responsive layout | `Grid` | `container?`, `item?`, `size?: {xs,sm,md,lg,xl}` (1–12), `spacing?`, `spacingX?`, `spacingY?` |
| Clickable button | `Button` | `text` (required), `href?`, `onClick?`, `type?`, `onHover?` + UIComponentProps |
| Text/underline link | `LinkButton` | `label` (required), `href?`, `onClick?` |
| Text field / textarea | `TextInput` | `label?`, `value?`, `onChange(v: string)?`, `type?`, `multirow?`, `rows?`, `placeholder?` + UIComponentProps |
| Toggle / checkbox | `Switch` | `checked?`, `defaultChecked?`, `onChange(checked: boolean)?` |
| Status tag / label | `Badge` | `children`, `variant?: 'filled'\|'outlined'\|'subtle'`, `size?: 'sm'\|'md'\|'lg'`, `color?`, `textColor?` |
| SVG icon | `Icon` | `icon` (SVG path, required), `color?`, `size?`, `backgroundColor?`, `backgroundShape?: 'circle'\|'square'\|'triangle'`, `shadow?` |
| Top navigation bar | `Navbar` | `logo` (required), `items?`, `fixedItems?`, `searchBox?`, `onSearch?`, `translucent?`, `themeSwitch?` |
| Mobile slide-in menu | `Drawer` | `open`, `onClose`, `items`, `logo`, `themeSwitch?` |
| Loading / progress | `ProgressBar` | `value?` (0–100, omit for indeterminate), `size?` (px height), `label?` |
| Confirm dialog | `ConfirmationModal` | `title`, `text`, `okCallback`, `cancelCallback?` |

#### Other UI exports (`packages/ui/src/`)

| Component | Purpose |
|---|---|
| `ThemeProvider` | Wraps app; provides `--accent`, `--background`, etc. CSS vars |
| `PaletteProvider` | Overrides accent palette |
| `ThemeSwitch` | Light/dark toggle button |
| `Hero` | Full-width hero section component |
| `HeroVideo` | Hero section with background video |

#### Import path convention

Each core-element is imported by its individual file path (the wildcard export in `packages/ui/package.json` handles resolution automatically — no index file or registration needed):

```tsx
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Grid } from '@repo/ui/core-elements/grid';
// etc.
```

Top-level UI exports use their direct path:

```tsx
import { ThemeProvider } from '@repo/ui/theme-provider';
import { Hero } from '@repo/ui/hero';
```

#### Adding or modifying a core element

When creating a new component in `packages/ui/src/core-elements/` or changing the props of an existing one:

1. **No package registration needed** — the `"./*": "./src/*.tsx"` wildcard export covers it automatically.
2. **Always create a companion `.css` file** for the component's styles (see Styling Conventions below).
3. **Update the component table in this file** (`CLAUDE.md`) to reflect the new or changed component and its key props. This must be done in the same task — never leave the table stale.

### Breakpoints

All responsive behaviour must align with the breakpoint scale defined in `packages/ui/src/core-elements/utils.ts`:

```
xs:   0 px   (mobile base)
sm: 600 px
md: 900 px
lg: 1200 px
xl: 1536 px
```

- **In TypeScript/TSX** — use the `Breakpoint` type and `BREAKPOINTS` record directly; never hardcode pixel values for breakpoint logic.
- **In CSS** — use the same pixel values in `@media` queries and add an inline comment with the breakpoint name so the mapping stays clear:

```css
@media (min-width: 600px)  { /* sm */ }
@media (min-width: 900px)  { /* md */ }
@media (min-width: 1200px) { /* lg */ }
@media (min-width: 1536px) { /* xl */ }
```

This keeps responsive behaviour consistent across every component and ensures a single place to update if the scale ever changes.

### Styling Conventions

- **Always use a separate `.css` file** for component-specific styles. Never use inline `style={{}}` objects or CSS-in-JS for custom component styles.
- Name the CSS file after the component: `my-component.css` alongside `my-component.tsx`, then `import './my-component.css'` at the top of the component file.
- `UIComponentProps` layout props (`padding`, `gap`, `width`, etc.) and the `styles` escape-hatch prop are the only acceptable inline styles — they are part of the `@repo/ui` design system contract.

#### `globals.css` — shared utility classes

Each Next.js app in `apps/` has its own `app/globals.css`, which is the single source of truth for styles that recur across more than one component within that app (headings, subtitles, shared card patterns, etc.).

**Rules:**
- **Before adding any style to a component CSS file, check whether an equivalent class already exists in `globals.css`.** If it does, use it.
- **If a pattern appears in two or more components, move it to `globals.css`** and delete the duplicates from the component files.
- **Component CSS files are for component-specific overrides only** — layout adjustments, local spacing tweaks, element-specific selectors that only make sense inside that one component.
- Never redefine a utility class from `globals.css` inside a component file. Use a scoped override (e.g. `.my-header .section-title { margin-bottom: 0; }`) when the shared default needs a local adjustment.

#### Shared utility classes currently in `globals.css` (`apps/website`)

| Class | Use for |
|---|---|
| `.section-title` | `<h2>` (or any heading) that titles a page section |
| `.section-subtitle` | Supporting paragraph beneath a section title |
| `.zoom-on-hover` | Card container with `overflow: hidden` — scales inner `<img>` to 1.1× on hover |

```tsx
<Typography as="h2" variant="none" className="section-title">{title}</Typography>
<Typography variant="none" className="section-subtitle">{subtitle}</Typography>
```

When adding a new shared utility class to `globals.css`, update this table so the catalogue stays current.

### i18n — Static Text

All static text in any Next.js app in `apps/` **must** use `next-intl` translations. Never hardcode user-visible strings directly in JSX.

- In server components, use `getTranslations('Namespace')` from `next-intl/server`.
- In client components, use `useTranslations('Namespace')` from `next-intl`.
- Add the key to **all** locale files under the app's `messages/` directory (e.g. `en.json`, `es.json`, `de.json`, `fr.json`, `pt.json`) in the same task.
- This rule applies only to static text written in the component. Text that comes from the API (model fields, server responses) is already locale-aware at the data layer and is exempt.

```tsx
// Server component
import { getTranslations } from 'next-intl/server';
const t = await getTranslations('MyComponent');
<h2>{t('heading')}</h2>

// Client component
import { useTranslations } from 'next-intl';
const t = useTranslations('MyComponent');
<h2>{t('heading')}</h2>
```

### Link Convention

- **Always use `Link` from `next/link` with the `prefetch` attribute** for internal navigation links instead of raw `<a>` tags.
- Reserve `<a>` for external links (i.e. links that open in a new tab with `target="_blank"` or point to an external domain).

```tsx
// Internal link — use Link
import Link from 'next/link';
<Link href="/about" prefetch>About</Link>

// External link — use <a>
<a href="https://example.com" target="_blank" rel="noopener noreferrer">External</a>
```

### Key Conventions

- **Workspace dependencies** use `workspace:*` protocol: `"@repo/ui": "workspace:*"`
- **All apps** use standalone Next.js output (`output: "standalone"`) for containerization
- **All apps** are PWA-enabled via `@ducanh2912/next-pwa`
- **All apps** use `next-intl` for i18n; locale routing is handled in the `@repo/i18n` package
- **ESLint is zero-tolerance**: `--max-warnings 0` — all warnings are treated as errors
- **Node.js >= 18** required

### Django Caching Rule

Always use `django.core.cache.cache` to cache model data in API views and clear it on mutations.

#### Caching GET responses

In every `GET` handler that returns model data, wrap the queryset result with `cache.get` / `cache.set`:

```python
from django.core.cache import cache

CACHE_TTL = 300  # 5 minutes

def get(self, request):
    cache_key = f"myapp:mymodel:{pk}"   # or a list key built from query params
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
    # … query …
    data = MySerializer(instance, context={"request": request}).data
    cache.set(cache_key, data, CACHE_TTL)
    return Response(data)
```

For list endpoints whose results vary by query params, derive a stable key from the sorted params (see `_list_key` in `catalog/views.py`).

#### Cache invalidation on mutations

After every `POST`, `PATCH`, `PUT`, or `DELETE` that modifies a model, delete the affected cache keys **before** (on delete) or **after** (on create/update) returning the response:

```python
def patch(self, request, pk):
    # … update …
    cache.delete(f"myapp:mymodel:{pk}")
    _invalidate_pattern("myapp:mymodels:*")   # invalidate list caches
    return Response(data)

def delete(self, request, pk):
    # … delete …
    cache.delete(f"myapp:mymodel:{pk}")
    _invalidate_pattern("myapp:mymodels:*")
    return Response(status=status.HTTP_204_NO_CONTENT)
```

Use this helper in every `views.py` and `admin.py` that does pattern-based invalidation:

```python
def _invalidate_pattern(pattern):
    """Delete all keys matching a glob pattern (Redis only; silently skipped on LocMemCache)."""
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        pass
```

#### Admin cache invalidation

Override `save_model` and `delete_model` in every `ModelAdmin` class to keep the cache consistent when data is changed through the Django admin:

```python
def save_model(self, request, obj, form, change):
    super().save_model(request, obj, form, change)
    cache.delete(f"myapp:mymodel:{obj.pk}")
    _invalidate_pattern("myapp:mymodels:*")

def delete_model(self, request, obj):
    cache.delete(f"myapp:mymodel:{obj.pk}")
    _invalidate_pattern("myapp:mymodels:*")
    super().delete_model(request, obj)
```

**Note:** Call `super().save_model(...)` *before* invalidating (object must be saved first); call `super().delete_model(...)` *after* invalidating (object still has its PK before deletion).

### Django Models — Full-Stack Coverage Rule

When adding a **new model** or a **new field to an existing model**, automatically assume the following work is also needed and do it in the same task:

1. **`admin.py`** — register the model (or add the field to `list_display` / `fields` / `readonly_fields` as appropriate).
2. **Serializer** — create or update a DRF serializer for the model/field.
3. **View** — create or update the corresponding API view (ViewSet, APIView, etc.).
4. **URL / endpoint** — wire the view into the router or `urlpatterns`.

**Exception — sensitive fields:** If a field is user-sensitive (passwords, raw tokens, emails, PII), **stop and ask the user** before exposing it in `admin.py` or any endpoint. Do not include it by default.

Examples of fields that require confirmation before exposure:
- `password`, `hashed_password`, any password-adjacent field
- `email`, `phone_number`, `date_of_birth`, or other PII
- `token`, `secret`, `api_key`, `refresh_token`

### Deployment

Apps are deployed to MicroK8s (Kubernetes) using Helm charts located in `packages/charts/`. The README.md documents the full cluster setup including cert-manager TLS, NFS shared storage, and node affinity configuration.
