# EdgeFolio

A **privacy-first career application platform for software engineers**. EdgeFolio
helps engineers maintain a single, factual source of truth about their career (the
**Immutable Matrix**), tailor it to specific job descriptions with an LLM that
*ranks and rewrites but never invents*, discover live job postings, and export
ATS-friendly resumes and cover letters — including NAFTA/USMCA **TN visa** letters.

Proprietary codebases can be analyzed **locally in the browser** (File System Access
API + tree-sitter WASM) so that only sanitized stack metadata — never source code —
is ever sent to the server, keeping the workflow NDA-compliant.

This repository contains the **frontend** (Next.js PWA). The Django REST backend
lives in [`apps/edge-folio-api`](../edge-folio-api/README.md). The two are designed
and shipped together — read both READMEs for the full system.

---

## Summary

EdgeFolio is split into a thin, privacy-respecting frontend and an AI-heavy backend:

- **Frontend** (`apps/edge-folio`) — Next.js 16 PWA. Renders the dashboard, runs all
  client-side codebase extraction, and proxies every API call to Django through its
  own Route Handlers so JWTs stay in HTTP-only cookies (invisible to JavaScript).
- **Backend** (`apps/edge-folio-api`) — Django REST Framework. Owns the data model,
  authentication, all LLM tailoring/scoring, company intelligence pipelines, and the
  job-postings catalog.

The browser **never** calls Django directly. Every request flows:

```
Browser (client component / server component / form action)
  → /app/api/<endpoint>/route.ts   (Next.js Route Handler — injects Bearer token)
    → Django API at process.env.API_URL   (server-to-server)
```

---

## Feature Areas

| Area | Route | What it does |
|---|---|---|
| **Immutable Matrix** | `/matrix` | CRUD of pre-approved, factual bullet points (STAR format) + skills. The master database the LLM draws from — it routes and ranks, never fabricates. |
| **Work Experience** | `/work-experience` | Manage employment history; bullets can be linked to a job. |
| **Education** | `/education` | Degrees, institutions, GPA, honors. |
| **Profile** | `/profile` | Contact info, summary, links, TN profession/citizenship, languages, projects, tech stack, passkeys, BYOK job-API keys, job-search preferences. |
| **Applications** | `/applications`, `/applications/[id]` | Track job applications and run the full AI tailoring pipeline (see below). |
| **Jobs** | `/jobs` | Browse the shared live job-postings catalog and an optional per-user feed; save a posting into an application. |
| **Extract Experience** | `/extract` | Pick a local repo, parse it in-browser, and synthesize new Matrix bullets from sanitized metadata. |
| **Onboarding** | `/onboarding` | First-run setup: resume upload, profile basics. |
| **Auth** | `/auth`, `/verify-email/[token]` | Email/password + JWT, email verification, password reset, **passkeys (WebAuthn)**. |

### Application tailoring pipeline

Opening an application and tailoring it drives these backend operations (all proxied):

- **Tailor resume** — ranks & rewrites Matrix bullets, skills, work experiences, and
  projects against the job description; computes overall, technical, and TN-likelihood
  match scores with explanations.
- **Cover letter** / **NAFTA (TN) letter** — generated from the tailored content.
- **Company intelligence** — async pipeline scrapes & analyzes the target company
  ("about", analysis, intel score).
- **TN suggest** — suggests NAFTA TN professional categories for the role.
- **Metrics refresh** — recomputes match scores on demand.

### Extract Experience (client-side, NDA-safe)

1. User picks a local directory via the **File System Access API** (`showDirectoryPicker`).
2. A **Web Worker** (`lib/ast-worker.ts`) runs the pipeline:
   - **Manifest parsing** — reads `package.json`, `requirements.txt`, `go.mod`,
     `Cargo.toml`, `Dockerfile`, `docker-compose.yml`, K8s manifests, `.kicad_pro` —
     dependency names and infra signals only.
   - **Import extraction (tree-sitter WASM)** — for `.ts/.tsx/.js/.jsx/.py`, parses
     only AST import declarations (module source strings). Variable/function names and
     business logic are never read. Falls back to regex when grammar WASM is missing.
3. Outputs a **Skeleton JSON** (`lib/skeleton-json.ts`): languages, frameworks,
   dependencies, infra flags — zero proprietary content.
4. The user reviews it, then it is POSTed to `/api/matrix/extract` for cloud LLM
   synthesis into draft bullet points.

> Earlier designs used a quantized WebGPU/OPFS model (Gemma) for on-device synthesis.
> The shipped extractor is **structural (tree-sitter)** — no model download, no GPU
> required — and the synthesis step runs on the server LLM.

---

## Technical Spec

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, `output: "standalone"`), React 19 |
| Language | TypeScript (strict, ES2022, ESM) |
| PWA | `@serwist/next` service worker, offline route (`~offline`) |
| i18n | `next-intl` v4 — locales: `en`, `es`, `de`, `fr`, `pt` |
| UI | `@repo/ui` (props-first component system), `@repo/helpers` |
| Data fetching | TanStack Query (client) + direct server-to-server `fetch` (server components) |
| PDF export | `@react-pdf/renderer` |
| Auth | JWT in HTTP-only cookies; `@simplewebauthn/browser` for passkeys |
| Code extraction | `web-tree-sitter` (WASM) in a Web Worker |
| Carousels | `swiper` |
| Logging | `pino` |

### App structure

```
app/[locale]/
  layout.tsx                  Root: theme, i18n, QueryClientProvider
  page.tsx                    Landing / marketing
  account/                    Account page
  ~offline/                   PWA offline fallback
  (auth)/
    auth/                     Login / signup
    verify-email/[token]/
  (dashboard)/                Guarded area (auth check in proxy.ts)
    matrix/  work-experience/  education/  profile/
    applications/  applications/[id]/
    jobs/  extract/  onboarding/
app/api/                      Route Handlers (proxy → Django + 2 external proxies)
  auth/…  matrix/…  career/…  applications/…  jobs/…
  groq/chat/                  LLM chat proxy (Groq → OpenRouter fallback)
  scraper/extract/            Job-URL scraper + LLM field extraction proxy
lib/                          Typed API clients + hooks (see below)
proxy.ts                      next-intl middleware + auth guard
```

### Route Handler conventions

- Handlers that call Django use **`apiFetch`** (`lib/api-fetch.ts`), which auto-retries
  with a refreshed access token on a 401. Never read `access_token` from cookies and
  call Django manually.
- **Exception** — routes that authenticate but call an *external* service (e.g.
  `groq/chat`, `scraper/extract`) verify the token and call `refreshAccessToken` on
  failure before returning 401.
- Login/signup/logout/verify-email/password-reset/passkey-auth don't need a valid
  access token, so they `fetch` Django directly and set the cookies.

### `lib/` modules

| File | Role |
|---|---|
| `api-fetch.ts` | `apiFetch` (refresh-and-retry), `refreshAccessToken` |
| `auth.ts` | Auth helpers / session utilities |
| `matrix.ts` / `career.ts` / `applications.ts` / `jobs.ts` | Typed client functions per domain |
| `resume-markdown.ts` / `resume-pdf.tsx` | ATS resume rendering (Markdown + PDF) |
| `nafta-constants.ts` | TN visa profession constants |
| `skeleton-json.ts` | `SkeletonJson` type — sanitized extractor output |
| `ast-worker.ts` / `ast-worker-types.ts` / `use-ast-extractor.ts` | tree-sitter worker + lifecycle hook |
| `use-directory-picker.ts` | File System Access API picker |
| `logger.ts` | `pino` logger |

### Environment variables

See `env.example`; create `.env.local` for local dev.

| Variable | Purpose |
|---|---|
| `API_URL` | Django base URL — **server-side only**, never `NEXT_PUBLIC_`. e.g. `http://localhost:8000` |
| `OPENROUTER_MODEL` | Model id for the `groq/chat` OpenRouter fallback |
| `NEXT_PUBLIC_*` | Anything that must reach the browser |

---

## Running locally

```bash
pnpm dev --filter=edge-folio        # http://localhost:3000
```

The Django API must be running on port 8000 — set `API_URL=http://localhost:8000` in
`.env.local`. See [`apps/edge-folio-api/README.md`](../edge-folio-api/README.md).

### tree-sitter WASM setup (for `/extract`)

```bash
pnpm prepare-wasm    # copies tree-sitter.wasm + downloads grammar WASMs → public/wasm/
```

Grammars are optional — a missing grammar triggers the regex import fallback.

### Useful commands

```bash
pnpm dev --filter=edge-folio
pnpm build --filter=edge-folio
pnpm lint --filter=edge-folio        # --max-warnings 0 (zero-tolerance)
pnpm check-types --filter=edge-folio
```

---

## Conventions (must-follow)

- **Props-first styling** on `@repo/ui` components — no layout/spacing/color-only CSS
  classes; use the `styles` escape hatch only for properties props don't cover.
- **All user-visible text** goes through `next-intl`; add keys to all five locale files
  (`messages/{en,es,de,fr,pt}.json`) in the same change.
- Use `Image` from `next/image` and `Link` from `next/link` (with `prefetch`).
- Form elements need accessible labels (`jsx-a11y` is enforced as error).
- The middleware file is `proxy.ts` (Next.js 16), not `middleware.ts`.

See `apps/edge-folio/CLAUDE.md`, `apps/CLAUDE.md`, and `packages/ui/CLAUDE.md` for full
rules.
