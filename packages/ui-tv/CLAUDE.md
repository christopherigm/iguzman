# `@repo/ui-tv` - Smart TV Component Library

TV-tuned React primitives for Tizen (Samsung Smart TV) apps. Separate from
`@repo/ui` because the web package depends on `next/*` (image, link, navigation,
next-intl) which does not run in a Vite/Tizen SPA, and because every interactive
TV element needs D-pad focus handling that pointer-driven web components lack.

## What "native" means on TV

Tizen has **no native HTML UI widgets**. A Tizen web app renders ordinary HTML.
The only "native" affordance is the system on-screen keyboard (IME), which opens
when a plain `<input>` is focused. `TvTextInput` wraps that.

## Components

| Import | Purpose |
| ------ | ------- |
| `@repo/ui-tv/spatial-nav-provider` → `initSpatialNav()` | Init Norigin spatial navigation once at startup. |
| `@repo/ui-tv/focusable` → `Focusable` | Generic D-pad-focusable wrapper; `group` for navigable containers. |
| `@repo/ui-tv/tv-button` → `TvButton` | Focusable button (`onPress` fires on remote Enter); `kind` (`primary`/`success`/`error`/`warning`) tints it, mirroring `@repo/ui`'s Button. |
| `@repo/ui-tv/tv-grid` → `TvGrid` | Fixed 8-column grid (constant TV screen); wraps children in a FocusContext so focusable items navigate in any direction. |
| `@repo/ui-tv/tv-text-input` → `TvTextInput` | Focusable field; Enter opens the TV IME. Requires `ariaLabel`. |
| `@repo/ui-tv/tv-typography` → `TvText` | 10-foot text scale (`hero`/`title`/`body`/`label`). |
| `@repo/ui-tv/tv-image` → `TvImage` | Old-Tizen-safe image box (aspect-ratio + fallback) - use instead of a bare `<img>`. |
| `@repo/ui-tv/tv-badge` → `TvBadge` | 10-foot status/metadata pill (`filled`/`outlined`/`subtle`); `subtle` uses `rgba()` not `color-mix()` for old Chromium. |
| `@repo/ui-tv/tv-scrollable` → `TvScrollable` | D-pad-scrollable region for tall, unfocusable content. Focusable itself: Up/Down scroll while focused, falling through to Norigin at the top/bottom edge; top/bottom fades show when more content exists. Needs an explicit `maxHeight`. |
| `@repo/ui-tv/remote-keys` → `TV_KEYS`, `onBackButton` | Remote key codes + Back-button helper. |

## Images - always use `TvImage`

Render images with `TvImage`, never a bare `<img>`. Real Tizen TVs run an old
Chromium (76-85 on Tizen 6.x) that **silently ignores `aspect-ratio` and the
`inset` shorthand**, which collapses an aspect-ratio'd or absolutely-positioned
image to zero height: the image downloads fine but never appears (it works in
the emulator's modern Chromium, so it slips through). `TvImage` reserves space
with the `padding-top` ratio hack and explicit edge offsets, and swaps in a
placeholder on missing/failed loads.

```tsx
import { TvImage } from '@repo/ui-tv/tv-image';

// Self-sizing by aspect ratio (poster); reserves height from width.
<TvImage src={movie.cover} ratio={2 / 3} placeholder={t('noCover')} />

// Fill a parent that already has a height (e.g. a full-bleed backdrop).
<TvImage src={url} fit="cover" />
```

## Old Tizen browser - CSS support floor

Target **Chromium 76+** (Tizen 6.x). Avoid CSS newer than that in this package
and in TV apps, or content renders in the emulator but not on the device:

- `aspect-ratio` (88+) → use a `padding-top` ratio hack.
- `inset` shorthand (87+) → use explicit `top`/`right`/`bottom`/`left`.
- `color-mix()` (111+) → use a palette token or `opacity` for muted text.
- flexbox `gap` (84+) → fine on most current panels but verify; prefer margins if it must work on the oldest.

Diagnose "image/element loads but is invisible or mispositioned" as a CSS-support
gap first, not a network/CORS/TLS problem.

## Conventions

- Focus engine: `@noriginmedia/norigin-spatial-navigation` (`useFocusable`).
- Styling: `tokens.css` (sizing/focus ring). It consumes the host app's palette
  variable contract (`--accent`, `--foreground`, `--surface-2`).
- Every interactive component composes the `.tv-focusable` / `.tv-focusable--focused`
  classes so the focus ring is consistent.
- No `next/*` imports - this package must stay bundler-agnostic for Vite/Tizen.
