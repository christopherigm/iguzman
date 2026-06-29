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
| `@repo/ui-tv/tv-button` → `TvButton` | Focusable button (`onPress` fires on remote Enter). |
| `@repo/ui-tv/tv-text-input` → `TvTextInput` | Focusable field; Enter opens the TV IME. Requires `ariaLabel`. |
| `@repo/ui-tv/tv-typography` → `TvText` | 10-foot text scale (`hero`/`title`/`body`/`label`). |
| `@repo/ui-tv/remote-keys` → `TV_KEYS`, `onBackButton` | Remote key codes + Back-button helper. |

## Conventions

- Focus engine: `@noriginmedia/norigin-spatial-navigation` (`useFocusable`).
- Styling: `tokens.css` (sizing/focus ring). It consumes the host app's palette
  variable contract (`--accent`, `--foreground`, `--surface-2`).
- Every interactive component composes the `.tv-focusable` / `.tv-focusable--focused`
  classes so the focus ring is consistent.
- No `next/*` imports - this package must stay bundler-agnostic for Vite/Tizen.
