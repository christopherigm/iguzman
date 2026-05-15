# `@repo/ui` — Component Library

## Use These First

**Rule:** When writing UI code in any Next.js app in `apps/`, always prefer `@repo/ui` components over raw HTML elements or one-off implementations.

### Mandatory usage rules

| Trigger                                                 | Required component                                | Never do instead                                        |
| ------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Rendering an array of items in a responsive column grid | `<Grid container>` + `<Grid size={...}>` per item | One-off `display: grid` CSS wrapper in a component file |
| Any centered, max-width page section                    | `<Container size="...">`                          | Custom `max-width` + `margin: auto` div                 |
| Any heading, body copy, label, or caption               | `<Typography as="h1–h6\|p\|span" variant="...">`  | Bare `<h1>`–`<h6>`, `<p>`, `<span>` for content text    |
| Any structural `<div>` wrapper                          | `<Box>`                                           | Bare `<div>`                                            |
| Any clickable button or internal-link button            | `<Button>` or `<LinkButton>`                      | Bare `<button>` or `<a>` for internal navigation        |

### `UIComponentProps` — shared layout props (all core-elements accept these)

Most components extend `UIComponentProps`, which maps common CSS properties directly to props:
`display`, `flexDirection`, `justifyContent`, `alignItems`, `flexWrap`, `flexGrow`, `gap`, `flex`, `alignSelf`, `order`, `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `padding`, `margin`, `marginTop`, `marginBottom`, `marginLeft`, `marginRight`, `marginInlineStart`, `marginInlineEnd`, `border`, `borderRadius`, `color`, `backgroundColor`, `shadow` (bool), `elevation` (number), `styles` (CSSProperties override), `className`, `id`, `children`.

### Core Elements (`packages/ui/src/core-elements/`)

| Use case                         | Component           | Key props                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headings, body text, labels      | `Typography`        | `variant?: 'none'\|'h1'…'h6'\|'body'\|'body-sm'\|'caption'\|'label'`, `as?` (HTML element override), `textAlign?`, `fontWeight?`, `role?`, `aria-current?`, `aria-hidden?`, `aria-label?`, `title?` + UIComponentProps. Heading variants h1–h5 use fluid `clamp()` sizing (h1 56px→32px hero, h2 32px→22px section titles, h3 22px→17px feature card names, h4 18px→15px secondary, h5 15px→13px compact card names). Use `variant="none"` only when a CSS class must fully control typography (e.g. `.section-subtitle` with its special opacity color).                                                                                                                   |
| Generic `<div>` wrapper          | `Box`               | `role?`, `aria-label?`, `aria-hidden?`, `aria-labelledby?`, `aria-describedby?`, `aria-modal?`, `onClick?` + all `UIComponentProps`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Centered max-width section       | `Container`         | `size?: 'xs'\|'sm'\|'md'\|'lg'\|'xl'`, `paddingX?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 12-col responsive layout         | `Grid`              | `container?`, `item?`, `size?: {xs,sm,md,lg,xl}` (1–12), `spacing?`, `spacingX?`, `spacingY?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Clickable button                 | `Button`            | `text?` (or `children`), `href?`, `onClick?`, `type?`, `size?: 'sm'\|'md'\|'lg'` (default `'sm'`; sm=6px pad/13px, md=8px 14px/13px, lg=10px 20px/14px+r8), `onHover?`, `unstyled?` (strips default styles/wave — use for icon or toggle buttons with custom CSS), `disabled?`, `title?`, `icon?` (SVG path — renders an internal `Icon`; auto-sizes to sm→13px/md→15px/lg→17px and adds flex layout automatically), `iconPosition?: 'start'\|'end'` (default `'start'`), `iconSize?` (CSS string override), `iconColor?` (defaults to `currentColor` — inherits button text color), `aria-label?`, `aria-pressed?`, `aria-expanded?`, `aria-controls?` + UIComponentProps |
| Text/underline link              | `LinkButton`        | `label` (required), `href?`, `onClick?`, `aria-label?`, `aria-current?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Text field / textarea            | `TextInput`         | `label?`, `value?`, `onChange(v: string)?`, `type?`, `multirow?`, `rows?`, `placeholder?` + UIComponentProps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Toggle / checkbox                | `Switch`            | `checked?`, `defaultChecked?`, `onChange(checked: boolean)?`, `disabled?` (default `false`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Status tag / label               | `Badge`             | `children`, `variant?: 'filled'\|'outlined'\|'subtle'`, `size?: 'sm'\|'md'\|'lg'`, `color?`, `textColor?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| SVG icon                         | `Icon`              | `icon` (SVG path, required), `color?`, `size?`, `backgroundColor?`, `backgroundShape?: 'circle'\|'square'\|'triangle'`, `shadow?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Top navigation bar               | `Navbar`            | `logo` (required), `items?`, `fixedItems?`, `searchBox?`, `onSearch?`, `translucent?`, `themeSwitch?`, `searchValue?` (controlled search text), `rightSlot?` (ReactNode rendered beside search)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Navbar height spacer             | `NavbarSpacer`      | No props. Renders a `div` with `height: var(--ui-navbar-height)` (57 px). Place at the top of any page that does not start with a `<Hero>` to push content below the fixed navbar. For full-viewport containers using `styles={{ paddingTop }}`, use `paddingTop: 'var(--ui-navbar-height)'` instead. Both import from `@repo/ui/core-elements/navbar`.                                                                                                                                                                                                                                                                                                                     |
| Page bottom spacer               | `PageBottomSpacer`  | No props. Renders a `div` with `height: var(--ui-page-bottom-spacing)` (default 64 px). Place as the last element on any detail or content page to add breathing room below the main content. Override the height via the CSS variable. Imports from `@repo/ui/core-elements/navbar`.                                                                                                                                                                                                                                                                                                                                                                                       |
| Mobile slide-in menu             | `Drawer`            | `open`, `onClose`, `items`, `logo`, `themeSwitch?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Loading / progress               | `ProgressBar`       | `value?` (0–100, omit for indeterminate), `size?` (px height), `label?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Small / inline loading indicator | `Spinner`           | `size?` (diameter px, default 20), `thickness?` (border px, default 2), `label?`. Use for non-full-width loading states such as metadata fetches, button pending states, and inline async actions — anywhere `ProgressBar` would be too heavy.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Confirm dialog                   | `ConfirmationModal` | `title`, `text`, `okCallback`, `cancelCallback?`, `children?` (rendered between text and actions), `panelMaxWidth?` (CSS string, default `420px`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Discrete range select            | `Slider`            | `steps: SliderStep[]` (array of `{value, label}`), `value` (current step value), `onChange(value)`, `label?` (shown above track), `disabled?` + UIComponentProps. Tick labels are clickable; the active step is highlighted in accent color. Also exports `SliderStep` type.                                                                                                                                                                                                                                                                                                                                                                                                |
| Page breadcrumb trail            | `Breadcrumbs`       | `items: BreadcrumbItem[]` — each item has `label: string` and optional `href?: string`; items without `href` render as the current page (aria-current). Also exports `BreadcrumbItem` type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CSS gradient picker              | `GradientBuilder`   | `value` (CSS string), `onChange(css: string)`, `label?` (field label above preview), `labels?: GradientBuilderLabels` (i18n overrides — keys: `linear`, `radial`, `solid`, `angle`, `color`, `stops`, `addStop`, `removeStop`, `pickColor`, `rawCss`; all fall back to English defaults). Renders a live preview strip, Linear/Radial/Solid type tabs, angle slider (linear), color-stop editor with swatch + hex + position %, and a raw CSS text field. Parses and writes standard CSS gradient strings. Also exports `GradientType`, `ColorStop`, `GradientBuilderLabels` types.                                                                                         |
| Language/locale picker           | `LocaleSwitcher`    | `locales: readonly string[]` (all available locale codes), `currentLocale: string` (active locale). Optional: `flags?: Record<string, string>` (emoji flag overrides by locale, defaults to 🇺🇸/🇪🇸/🇫🇷/🇩🇪/🇧🇷), `labels?: Record<string, string>` (display label overrides, defaults to uppercase locale code). Renders a dropdown that opens upward; on selection navigates to the same path under the chosen locale prefix. Uses `usePathname`/`useRouter` from `next/navigation` — replaces the first path segment. Suitable for footers and navbars.                                                                                                                       |
| Markdown / rich-text body        | `RichText`          | `children` (markdown string, required), `className?`. Renders markdown via `react-markdown` + `remark-gfm` (GFM tables, strikethrough, etc.). Does **not** extend `UIComponentProps` — wrap in `<Box>` for layout props.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Fixed-position notification      | `Toast`             | `message` (required), `variant: 'error'\|'success'`, `position?: 'bottom-left'\|'bottom-center'\|'bottom-right'\|'top-left'\|'top-center'\|'top-right'` (default `'bottom-left'`), `duration?` (seconds before auto-dismiss, default `5`, pass `0` to never dismiss). Renders fixed on screen with `z-index: 1000`; slides in/out from the nearest edge. Click to dismiss early. Also exports `ToastVariant` and `ToastPosition` types.                                                                                                                                                                                                                                     |
| Voice input mic button           | `SpeechButton`      | `mode?: 'batch'\|'realtime'` (default `'batch'`), `language?` (BCP-47, default `'en'`), `model?` (HF model ID, default `'Xenova/whisper-tiny'`), `realtimeInterval?` (ms), `micIcon?`, `stopIcon?`, `onTranscript(text)?`, `onInterimTranscript(text)?`, `aria-label?` + UIComponentProps. Requires COOP+COEP headers (SharedArrayBuffer). Hook also available separately: `import { useSpeechToText } from '@repo/ui/use-speech-to-text'`.                                                                                                                                                                                                                                 |
| Text-to-speech button            | `SpeakButton`       | `text` (required — string to speak), `engine?: 'browser'\|'neural'` (default `'browser'`), `language?` (BCP-47, default `'en'`), `model?` (HF model ID, neural only, default `'Xenova/speecht5_tts'`), `speakerEmbeddings?` (URL, neural only), `rate?`, `pitch?`, `volume?` (browser only), `speakIcon?`, `stopIcon?`, `onSpeakStart?`, `onSpeakEnd?`, `aria-label?` + UIComponentProps. Neural engine requires COOP+COEP headers. Hook also available separately: `import { useTextToSpeech } from '@repo/ui/use-text-to-speech'`.                                                                                                                                        |

### Other UI exports (`packages/ui/src/`)

| Component         | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `ThemeProvider`   | Wraps app; provides `--accent`, `--background`, etc. CSS vars |
| `PaletteProvider` | Overrides accent palette                                      |
| `ThemeSwitch`     | Light/dark toggle button                                      |
| `Hero`            | Full-width hero section component                             |
| `HeroVideo`       | Hero section with background video                            |

### Import path convention

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

### Adding or modifying a core element

When creating a new component in `packages/ui/src/core-elements/` or changing the props of an existing one:

1. **No package registration needed** — the `"./*": "./src/*.tsx"` wildcard export covers it automatically.
2. **Always create a companion `.css` file** for the component's styles (see Styling Conventions below).
3. **Update the component table in this file** (`packages/ui/CLAUDE.md`) to reflect the new or changed component and its key props. This must be done in the same task — never leave the table stale.

## Breakpoints

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
@media (min-width: 600px) {
  /* sm */
}
@media (min-width: 900px) {
  /* md */
}
@media (min-width: 1200px) {
  /* lg */
}
@media (min-width: 1536px) {
  /* xl */
}
```

## Styling Conventions

- **Always use a separate `.css` file** for component-specific styles. Never use inline `style={{}}` objects or CSS-in-JS for custom component styles.
- Name the CSS file after the component: `my-component.css` alongside `my-component.tsx`, then `import './my-component.css'` at the top of the component file.
- `UIComponentProps` layout props (`padding`, `gap`, `width`, etc.) and the `styles` escape-hatch prop are the only acceptable inline styles — they are part of the `@repo/ui` design system contract.

### Component-props-first rule

**Static styles on `@repo/ui` components must always be expressed as component props — never in a CSS file.**

| Use component props                                                                           | CSS is the only option                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Layout: `display`, `flexDirection`, `gap`, `alignItems`, `justifyContent`, `flex`, `flexWrap` | `:hover`, `:focus`, `:disabled`, `:active` pseudo-class rules |
| Sizing: `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`                   | `transition` and `animation`                                  |
| Spacing: `padding`, `margin`, `marginTop`, `marginBottom`, etc.                               | `transform` (active-state indicators)                         |
| Borders: `border`, `borderRadius`                                                             | `@media` queries for breakpoint-specific overrides            |
| Color: `color`, `backgroundColor`                                                             | `::before` / `::after` pseudo-elements                        |
| Shadow / elevation: `elevation`, `shadow`                                                     | Structural selectors (`:nth-child`, etc.)                     |
| Typography: `fontWeight`, `textAlign`, `color`                                                |                                                               |

**For CSS properties not covered by `UIComponentProps`** (e.g. `fontSize`, `letterSpacing`, `textTransform`, `opacity`, `lineHeight`, `whiteSpace`, `overflow`, `textOverflow`) use the `styles` escape-hatch prop — **never** put them in a CSS class:

```tsx
// ✗ Wrong — static values in a CSS class
<Typography as="h3" variant="h3" className="my-label">…</Typography>
/* .my-label { font-size: 11px; font-weight: 700; color: #999; letter-spacing: 0.06em; text-transform: uppercase; } */

// ✓ Correct — all expressed as props
<Typography
  as="h3"
  variant="h3"
  color="var(--foreground-muted, #999)"
  fontWeight={700}
  styles={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}
>…</Typography>
```

**Rule:** a CSS class attached to a `@repo/ui` component must contain **only** entries from the right column above (pseudo-class rules, transitions/animations, `@media` overrides, pseudo-elements). If a CSS class contains nothing but left-column properties, delete it entirely and use props. Dynamic values driven by React state belong on the prop using a ternary, not in a CSS class.

### `globals.css` — shared utility classes

Each Next.js app in `apps/` has its own `app/globals.css`, which is the single source of truth for styles that recur across more than one component within that app.

**Rules:**

- **Before adding any style to a component CSS file, check whether an equivalent class already exists in `globals.css`.** If it does, use it.
- **If a pattern appears in two or more components, move it to `globals.css`** and delete the duplicates from the component files.
- **Component CSS files are for component-specific overrides only.**
- Never redefine a utility class from `globals.css` inside a component file. Use a scoped override (e.g. `.my-header .section-title { margin-bottom: 0; }`) when the shared default needs a local adjustment.
