# cinelog-tv - Samsung Smart TV (Tizen) App

Vite + React SPA packaged as a Tizen `.wgt`, built on `@repo/ui-tv` (Norigin
spatial navigation for D-pad focus). Not a Next.js app - the `apps/CLAUDE.md`
Next.js conventions (next/image, next-intl, proxy.ts, apiFetch) do **not** apply
here. See `README.md` for build/package/run, and `packages/ui-tv/CLAUDE.md` for
the component library.

## Target the real device: Tizen 6.0 = Chromium 76

`config.xml` pins `required_version="6.0"`. **Real Samsung TVs on Tizen 6.0 run
Chromium 76** - a 2019 engine, far older than any dev machine. Whenever you add
or change CSS in this app (or in `@repo/ui-tv`, which this app consumes), write
it for **Chromium 76**, not for your laptop's browser.

**Why this bites repeatedly:** the Tizen *emulator* and `pnpm dev` in a desktop
browser both run a modern Chromium, so anything you write renders fine there.
The bug only shows up on the physical TV, after packaging - the slowest possible
feedback loop. Assume "works in the emulator" tells you nothing about the device.

When something "loads but is invisible, zero-size, or mispositioned" on the TV,
diagnose it as a **CSS-support gap first**, not a network/CORS/TLS problem.

### CSS support floor (Chromium 76)

The full list lives in `packages/ui-tv/CLAUDE.md` → "Old Tizen browser - CSS
support floor". The ones that have actually broken this app:

| Don't use | Min version | Do instead |
| --------- | ----------- | ---------- |
| `aspect-ratio` | 88 | `padding-top` ratio hack (see `TvImage`) |
| `inset` shorthand | 87 | explicit `top` / `right` / `bottom` / `left` |
| `color-mix()` | 111 | a palette token, or `opacity` for muted text |
| `gap` (flexbox) | 84 | `margin` on the children |
| **percentage height off a derived-height box** | — | give the box an **explicit** height (`100vh`, fixed px) |

That last row is the one that broke both backdrops: an element whose own height
comes from `top:0; bottom:0` (a *derived* height) does **not** give a child's
`height: 100%` something to resolve against on Chromium 76 - the child collapses
to zero and the image, though downloaded, never paints. Fixed-size flow elements
(explicit px width/height) are immune; the trap is percentage/auto sizing.

## Images - always use `TvImage`

Render every image through `TvImage` from `@repo/ui-tv/tv-image`, never a bare
`<img>`, for exactly the reasons above (it reserves space with the `padding-top`
ratio hack or fills an explicitly-sized parent, and swaps in a placeholder on a
missing/failed load).

- **Aspect-ratio box** (poster, thumbnail): `<TvImage src={...} ratio={2/3} />`.
- **Fill a parent** (full-bleed backdrop): give the parent an **explicit** height
  (`height: 100vh`, not `top/bottom: 0`), then `<TvImage src={...} fit="cover" />`.

The sole acceptable bare `<img>` is a **fixed-size, normal-flow** icon with
explicit px `width`/`height` and a transparent background (e.g. the full-color
badge in `tv-format-header.tsx`) - it doesn't hit the collapse bug, and `TvImage`
would add an opaque background square behind it.

## i18n

Uses a lightweight in-app provider (`src/i18n/provider.tsx`), **not** next-intl.
Add user-visible strings as keys via `useT()`/`t(...)`; never hardcode them.
