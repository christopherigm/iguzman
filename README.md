# iguzman

A Turborepo monorepo for building full-stack web applications with Next.js, React, and shared packages.

## Tech Stack

- **Runtime:** Node.js, React 19, Next.js 16
- **UI:** Material-UI 7, Emotion
- **Data:** MongoDB, Redis
- **AI:** Ollama
- **Validation:** Zod
- **Auth:** Jose (JWT)
- **Analytics:** Plausible
- **Build:** Turborepo, TypeScript 5, pnpm 10

## Project Structure

```
iguzman/
├── apps/
│   └── hello-world-app/         # Next.js demo application
├── packages/
│   ├── ui/                      # Shared React UI component library
│   ├── helpers/                 # TypeScript utility library (FFmpeg, media processing)
│   ├── typescript-config/       # Shared TypeScript configurations
│   ├── eslint-config/           # Shared ESLint configurations
│   └── jest-config/             # Shared Jest configuration
├── turbo.json                   # Turborepo task configuration
├── pnpm-workspace.yaml          # pnpm workspace definition
└── package.json                 # Root package with shared dependencies
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (ES2022+ compatible)
- [pnpm](https://pnpm.io/) 10.4.1+
- [FFmpeg](https://ffmpeg.org/) (required by `@iguzman/helpers` for media processing)

### Installation

```bash
pnpm install
```

### Development

Start all apps and packages in watch mode:

```bash
pnpm dev
```

The hello-world-app will be available at `http://localhost:3000`.

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

### Lint

```bash
pnpm lint
```

### Clean

Remove all build artifacts (`dist/`, `.next/`):

```bash
pnpm clean
```

## Apps

### hello-world-app

A Next.js 16 application using the App Router that demonstrates the monorepo setup. It consumes the shared `@iguzman/ui` component library and uses Material-UI with a custom ThemeRegistry for styling.

**Key files:**

- `src/app/layout.tsx` — Root layout with ThemeRegistry
- `src/app/page.tsx` — Home page
- `src/app/ThemeRegistry.tsx` — MUI theme provider setup

## Packages

### @iguzman/ui

Shared React UI component library built on Material-UI.

**Exports:**

- `Button` — Type-safe wrapper around MUI Button

### @iguzman/helpers

TypeScript utility library with media processing capabilities.

**Exports:**

- `addAudioToVideoInTime()` — Merges audio into video at a given time offset using FFmpeg. Supports WAV, MP3, and OGG formats.
- `stripMediaPrefix()` — Removes leading `media/` from file paths.
- `buildFfmpegArgs()` — Constructs FFmpeg CLI arguments for audio/video merging.

### @iguzman/typescript-config

Shared TypeScript compiler configurations:

| Config               | Purpose                         |
| -------------------- | ------------------------------- |
| `base.json`          | Strict base config (ES2022)     |
| `nextjs.json`        | Next.js apps (DOM, Next plugin) |
| `react-library.json` | React component libraries (JSX) |

### @iguzman/eslint-config

Shared ESLint configuration using `@eslint/js`, `typescript-eslint`, and `eslint-config-prettier`.

### @iguzman/jest-config

Shared Jest configuration using `ts-jest` with Node.js test environment.

## Turborepo Tasks

| Task    | Depends On | Cached | Description                    |
| ------- | ---------- | ------ | ------------------------------ |
| `build` | `^build`   | Yes    | Compile all packages/apps      |
| `dev`   | —          | No     | Start dev servers (persistent) |
| `lint`  | `^build`   | Yes    | Run ESLint across workspace    |
| `test`  | `^build`   | Yes    | Run Jest tests                 |
| `clean` | —          | No     | Remove build artifacts         |

### Filtering

Run tasks for a specific package:

```bash
pnpm turbo run build --filter=@iguzman/helpers
pnpm turbo run test --filter=@iguzman/ui
```

## Architecture

- **pnpm workspaces** manage dependencies across packages with hoisting and deduplication.
- **Turborepo** orchestrates builds with a dependency-aware task graph and remote caching support.
- **Shared configs** (TypeScript, ESLint, Jest) are centralized in dedicated packages to ensure consistency.
- **Workspace protocol** (`workspace:*`) links internal packages without version pinning.

## License

Copyright (c) 2026 Christopher Guzman. All rights reserved.
