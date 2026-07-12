# `@repo/ui-native` - React Native Component Library

Props-first React Native primitives for Expo apps (scaffolded by
`cli/new-rn-app/new-rn-app.sh`). Separate from `@repo/ui` because the web
package depends on `next/*` (image, link, navigation, next-intl) and the DOM
(FFmpeg WASM, chart.js, `react-dom`), none of which run in React Native. This
package is **bundler-agnostic** - it imports only from `react` and
`react-native`, so Metro (Expo) bundles it directly from source.

## Component-props-first rule (the native mirror)

Just like `@repo/ui`, you style these components through **props**, not
hand-written `StyleSheet` objects. `Box`, `Screen`, and `Button` accept the
layout/spacing/sizing/color props defined by `UINativeProps` (`style-props.ts`).
Reach for the `styles` escape hatch only for what the prop API does not cover.

`UINativeProps` mirrors `@repo/ui`'s `UIComponentProps`, with React-Native
realities baked in:

- `flexDirection` defaults to **`column`** (RN), not `row` (CSS).
- No `paddingX/paddingY` in RN - but they are **accepted** here and forwarded to
  `paddingHorizontal` / `paddingVertical`.
- `shadow` / `elevation` emit Android `elevation` **and** iOS `shadow*` props so
  one prop reads on both platforms.

## Components

| Import | Purpose |
| ------ | ------- |
| `@repo/ui-native/theme-provider` → `ThemeProvider`, `useTheme` | Wrap the app root once. Resolves a palette + OS color scheme into a `Theme` (`colors`, `spacing`, `radius`, `typeScale`). `useTheme()` falls back to the default light palette when no provider is mounted. |
| `@repo/ui-native/theme` → `palettes`, `resolveTheme`, `spacing`, `radius`, `typeScale` | Palette tokens (6 accents, light + dark) and design scales. Token names match `@repo/ui`'s web palette (`background`, `surface1`, `accent`, …). |
| `@repo/ui-native/box` → `Box` | Props-first `View`. Layout/spacing/color via props; `styles` escape hatch for the rest. |
| `@repo/ui-native/typography` → `Typography` | Themed `Text`. `variant` (`hero`/`title`/`subtitle`/`body`/`caption`/`label`) sets size + weight; `color` accepts a token alias (`foreground`/`muted`/`accent`) or a raw color. |
| `@repo/ui-native/button` → `Button` | Pressable button. `kind` (`primary`/`success`/`error`/`warning`) sets the intent color; `variant` (`solid`/`outline`/`ghost`); `loading` shows a spinner. |
| `@repo/ui-native/screen` → `Screen` | Themed route root: paints the background, syncs the status-bar style to the color scheme, `scroll`/`center` options. |
| `@repo/ui-native/style-props` → `UINativeProps`, `buildViewStyle`, `getShadowStyle` | The props-first engine, for building your own primitives. |

## Sharing with `@repo/helpers`

`@repo/helpers` exports **per file** (`"./*": "./src/*.ts"`), so a React Native
app may import individual **pure** utilities (e.g. `@repo/helpers/json-api-rebuild`,
data validation, formatting). Do **not** import helpers that touch the DOM, Node,
FFmpeg WASM, MongoDB, `localStorage`, or `canvas` - they will not run in RN.

## Version targets

Built for the Expo SDK the scaffold pins (currently **SDK 56 / React Native
0.85 / React 19.2**, New Architecture). `boxShadow` in `getShadowStyle` needs
RN 0.76+; the `peerDependencies` floor is `react-native >=0.79`.
