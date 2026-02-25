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
- **horoscope** — Astrology app; see `apps/horoscope/STYLE_GUIDE.md` for the required visual language (fonts, colors, glassmorphism, layout patterns)
- **video-downloader** — The most actively maintained app; client-side video editing using FFmpeg WASM. Requires `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers (already configured in `next.config.ts`) for SharedArrayBuffer support

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

### Key Conventions

- **Workspace dependencies** use `workspace:*` protocol: `"@repo/ui": "workspace:*"`
- **All apps** use standalone Next.js output (`output: "standalone"`) for containerization
- **All apps** are PWA-enabled via `@ducanh2912/next-pwa`
- **All apps** use `next-intl` for i18n; locale routing is handled in the `@repo/i18n` package
- **ESLint is zero-tolerance**: `--max-warnings 0` — all warnings are treated as errors
- **Node.js >= 18** required

### Deployment

Apps are deployed to MicroK8s (Kubernetes) using Helm charts located in `packages/charts/`. The README.md documents the full cluster setup including cert-manager TLS, NFS shared storage, and node affinity configuration.
