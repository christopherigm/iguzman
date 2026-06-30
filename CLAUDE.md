# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Styling Rule - Props First, CSS Last

**When styling any `@repo/ui` component (`Box`, `Typography`, `Button`, `Container`, etc.), always use UIComponentProps. Never write a CSS class whose only content is layout, spacing, sizing, border, or color properties.**

A CSS class attached to a `@repo/ui` component is only valid if it contains exclusively:

- Pseudo-selectors (`:hover`, `:focus`, `:disabled`)
- Transitions and animations
- `@media` breakpoint overrides
- `::before` / `::after` pseudo-elements

For CSS properties not covered by UIComponentProps (e.g. `gridTemplateColumns`, `fontSize`, `letterSpacing`), use the `styles` escape-hatch prop - never a CSS class.

See `packages/ui/CLAUDE.md` → "Component-props-first rule" for the full reference table.

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

This is a **Turborepo monorepo** with Next.js applications and shared packages.

### Apps (`apps/`)

- **web** - General-purpose Next.js app
- **website** - Marketing/public-facing Next.js app with catalog, success stories, and highlights sections
- **horoscope** - Next.js app
- **video-downloader** - The most actively maintained app; client-side video editing using FFmpeg WASM. Requires `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers (already configured in `next.config.ts`) for SharedArrayBuffer support
- **website-api** - Django REST API backend for the website app
- **edge-folio** - Next.js PWA: privacy-first career app for engineers (Immutable Matrix, job tailoring, ATS export, client-side OPFS+WebGPU codebase extraction). See `apps/edge-folio/CLAUDE.md`.
- **edge-folio-api** - Django REST API backend for edge-folio. See `apps/edge-folio-api/CLAUDE.md`.
- **cinelog-tv** - Samsung Smart TV (Tizen) app. **Not Next.js** - a Vite + React SPA on `@repo/ui-tv`, packaged as a `.wgt`. The Next.js conventions in `apps/CLAUDE.md` do not apply; see `apps/cinelog-tv/CLAUDE.md` and the "Smart TV Apps (Tizen)" section below. Scaffold new TV apps with `cli/new-smarttv-app/new-smarttv-app.sh`.

### Packages (`packages/`)

- **`@repo/helpers`** - Core utility library (~9k lines). Contains video processing (concat, audio/subtitle/image composition), data validation, and audio manipulation. Each utility is documented with a companion `.md` file
- **`@repo/ui`** - Shared React components, theme providers, palette system, and the `use-ffmpeg` hook for FFmpeg WASM integration (depends on `next/*`; web apps only)
- **`@repo/ui-tv`** - Smart TV (Tizen) React primitives: D-pad spatial navigation, 10-foot components, and the old-Chromium-safe `TvImage`. Bundler-agnostic (no `next/*`) so it runs in the Vite/Tizen SPA. See `packages/ui-tv/CLAUDE.md`
- **`@repo/i18n`** - `next-intl` routing and config for multi-locale support
- **`@repo/eslint-config`** - Shared flat ESLint config (Next.js variant)
- **`@repo/typescript-config`** - Shared `tsconfig` base (ESM, strict, ES2022)
- **`packages/charts`** - Helm charts for Kubernetes deployment

### Key Component Architecture (video-downloader)

`VideoItem` is the main card component. Its logic is split across two hooks:

- `use-video-processing.ts` - FFmpeg queue, `checkBars`, `cropString` state, all media processing handlers. Accepts `t` (translation fn) to set error messages.
- `use-video-download.ts` - download trigger, SSE-based task polling, all resume effects on mount.

`use-ffmpeg.ts` (in `@repo/ui`) offloads all FFmpeg WASM operations to a dedicated Web Worker (`ffmpeg-worker.ts`). `removeBlackBars` accepts an optional pre-computed `cropString` to skip the `cropdetect` pass when bars were already detected.

The download polling uses **Server-Sent Events** (`/api/download-video/[id]/stream`) instead of interval polling. `use-poll-task.ts` uses `EventSource` to receive push updates.

Filter state in `VideoGrid` is stored in URL search params (`?platform=`, `?status=`, `?audio=`, `?per=`, `?page=`), making filters bookmarkable/shareable.

## Help App - Keep Documentation in Sync

`apps/help/` is the developer documentation hub for this monorepo. **Any change to a documented CLI script, pnpm command, or app API must be reflected in `apps/help/` in the same task** - update both the source constant/code block and all five locale files (`messages/en.json`, `es.json`, `de.json`, `fr.json`, `pt.json`).

See `apps/help/CLAUDE.md` for the full inventory: which scripts map to which constants and panel files.

## Key Conventions

- **Workspace dependencies** use `workspace:*` protocol: `"@repo/ui": "workspace:*"`
- **Next.js apps** use standalone output (`output: "standalone"`) for containerization, are PWA-enabled via `@ducanh2912/next-pwa`, and use `next-intl` for i18n (locale routing in `@repo/i18n`). Smart TV apps (Tizen) are the exception - Vite SPAs with their own lightweight i18n provider; see below.
- **ESLint is zero-tolerance**: `--max-warnings 0` - all warnings are treated as errors
- **Node.js >= 18** required

## Smart TV Apps (Tizen)

`cinelog-tv` (and any app scaffolded by `cli/new-smarttv-app/new-smarttv-app.sh`)
is a **Samsung Smart TV / Tizen** app: a Vite + React SPA on `@repo/ui-tv`,
packaged as a `.wgt` - not a Next.js app, not Docker/Helm-deployed.

**The one rule that bites repeatedly: target the real device's old browser.**
Real Samsung TVs on Tizen 6.0 run **Chromium 76** (2019). Whenever you write CSS
for a TV app or for `@repo/ui-tv`, write it for **Chromium 76**, not your laptop:
no `aspect-ratio` (88+), no `inset` shorthand (87+), no `color-mix()` (111+),
prefer `margin` over flexbox `gap`, and never rely on a percentage height inside
a box whose own height is *derived* (e.g. from `top:0; bottom:0`) - give such a
box an explicit height. The Tizen emulator and `pnpm dev` both run a modern
Chromium, so these gaps only surface on the physical TV after packaging.

Render every image through `TvImage` (`@repo/ui-tv/tv-image`), never a bare
`<img>`. The full CSS-support floor and image guidance live in
`packages/ui-tv/CLAUDE.md` and each app's `apps/<name>/CLAUDE.md` (the scaffold
generates one per app).

## TypeScript - Always Check After Writing

After writing or modifying any `.ts` or `.tsx` file, always run `pnpm check-types` and fix every error before considering the task done. Never leave type errors behind.

## Deployment

Apps are deployed to MicroK8s (Kubernetes) using Helm charts located in `packages/charts/`. The README.md documents the full cluster setup including cert-manager TLS, NFS shared storage, and node affinity configuration.
