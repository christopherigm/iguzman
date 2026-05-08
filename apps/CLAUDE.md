# Next.js App Conventions

These rules apply to every Next.js app in `apps/`.

## Accessibility — Form Element Labels

Every `<input>`, `<select>`, and `<textarea>` element must have an accessible label. The ESLint `jsx-a11y` rules enforce this as an error (`--max-warnings 0`).

**Required:** one of the following must be present on every form element:

| Method | When to use |
|---|---|
| `aria-label="..."` | Element is visually labelled by adjacent text but has no programmatic association |
| `aria-labelledby="id"` | A separate element already in the DOM provides the label text |
| `id` paired with `<label htmlFor="id">` | Standard HTML label association |
| `aria-hidden="true"` | Element is purely decorative / programmatically triggered (e.g. a hidden file input triggered by a button) |

```tsx
<input type="range" aria-label={t('mySliderLabel')} ... />
<input type="file" aria-hidden="true" ... />
<select aria-label={t('mySelectLabel')} ... />
```

**Rule:** if a `<Typography>` or plain text immediately precedes or follows the control, reuse its translation key as the `aria-label` value — never hardcode strings.

## i18n — Static Text

All static text **must** use `next-intl` translations. Never hardcode user-visible strings directly in JSX.

- In server components, use `getTranslations('Namespace')` from `next-intl/server`.
- In client components, use `useTranslations('Namespace')` from `next-intl`.
- Add the key to **all** locale files under the app's `messages/` directory (`en.json`, `es.json`, `de.json`, `fr.json`, `pt.json`) in the same task.
- Text that comes from the API is exempt — it is already locale-aware at the data layer.

## Image Convention

- **Always use `<Image>` from `next/image`** instead of bare `<img>` tags.
- For images that fill their parent container, use the `fill` prop — the parent must have `position: relative`, defined dimensions, and `overflow: hidden`.
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

## TypeScript — CSS Module Declarations

Each app includes a `css.d.ts` file at its root for ambient module declarations for CSS subpath imports that TypeScript cannot resolve (e.g. `swiper/css`):

```ts
declare module 'swiper/css';
declare module 'swiper/css/*';
```

**Rule:** If you add a new CSS side-effect import from a third-party package and TypeScript raises TS2882, add a `declare module` entry to the app's `css.d.ts`. Never create a separate per-package `.d.ts` file — `css.d.ts` is the single place for these declarations.
