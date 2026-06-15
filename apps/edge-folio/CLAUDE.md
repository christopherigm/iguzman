# Edge Folio (Frontend)

Next.js PWA frontend for EdgeFolio — a privacy-first career application platform for software engineers. Features: Immutable Matrix management, job application tailoring, ATS resume export, and client-side NDA-compliant codebase extraction via OPFS + WebGPU.

## Running Locally

```bash
pnpm dev --filter=edge-folio
```

The Django API (`apps/edge-folio-api`) must be running on port 8000. Set `API_URL=http://localhost:8000` in `.env.local`.

## API Communication — Proxy Pattern

The browser **never** calls the Django API directly. All API traffic goes through Next.js Route Handlers:

```
Browser (client component or form action)
  → /app/api/<endpoint>/route.ts  (Next.js Route Handler)
    → Django API at process.env.API_URL  (server-to-server)
```

**Why:** JWT tokens are stored in HTTP-only cookies (`access_token`, `refresh_token`), which are invisible to JavaScript. Route handlers read those cookies and inject `Authorization: Bearer <token>` before forwarding to Django.

### Login / Signup Route Handler Pattern

```ts
// app/api/auth/login/route.ts
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${process.env.API_URL}/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const cookieStore = await cookies();
  cookieStore.set('access_token', data.access, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', path: '/',
  });
  cookieStore.set('refresh_token', data.refresh, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', path: '/',
  });
  return NextResponse.json({ user: data.user });
}
```

### Authenticated Route Handler Pattern

```ts
// app/api/matrix/route.ts
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const res = await fetch(`${process.env.API_URL}/api/matrix/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

### Server Component Pattern

Server components can call Django directly (server-to-server, no Route Handler needed):

```ts
import { cookies } from 'next/headers';

export default async function MatrixPage() {
  const token = (await cookies()).get('access_token')?.value;
  const res = await fetch(`${process.env.API_URL}/api/matrix/`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  // render...
}
```

## Data Fetching

| Context | Approach |
|---|---|
| Server components | Direct `fetch` to Django (server-to-server), token from `cookies()` |
| Client components | **TanStack Query** (`@tanstack/react-query`) calling `/api/...` route handlers |

TanStack Query is used for all client-side data fetching. The `QueryClient` is initialized in `app/[locale]/layout.tsx`. Prefer optimistic updates for Immutable Matrix mutations (bullet points are frequently reordered and edited).

## App Structure

```
app/[locale]/
  layout.tsx              — Root layout: theme, i18n, QueryClientProvider
  page.tsx                — Landing / marketing page
  account/                — Account page
  ~offline/               — PWA offline fallback
  (auth)/                 — auth (login/signup), verify-email/[token]
  (dashboard)/            — Authenticated area (guarded in proxy.ts)
    matrix/               — Immutable Matrix: skills + bullet points
    work-experience/      — Employment history
    education/            — Degrees
    profile/              — Profile, languages, projects, passkeys, BYOK keys, job-search prefs
    applications/         — Job application tracker
    applications/[id]/    — Single application: tailoring, scores, cover/TN letters
    jobs/                 — Live job-postings catalog + per-user feed
    extract/              — Local codebase extraction (tree-sitter WASM)
    onboarding/           — First-run setup
```

`app/api/` Route Handlers proxy these domains to Django: `auth/`, `matrix/`, `career/`,
`applications/`, `jobs/`. Two handlers proxy **external** services instead:
`groq/chat/` (LLM chat, Groq→OpenRouter) and `scraper/extract/` (job-URL scraper + LLM
field extraction).

Authentication guard (redirect unauthenticated users) lives in `proxy.ts` alongside the next-intl middleware.

> **Note:** the shipped extractor is **structural (tree-sitter WASM)** — no model
> download and no WebGPU required. Earlier docs referencing an OPFS/WebGPU Gemma model
> describe a superseded design; bullet synthesis now runs on the server LLM.

## Client-Side AST Extraction — web-tree-sitter

The "Extract Experience" feature parses a local repository **structurally** in the browser using `web-tree-sitter` (WASM). No model download, no GPU required.

### How it works

1. The user picks a local directory via the **File System Access API** (`showDirectoryPicker`).
2. A **Web Worker** (`lib/ast-worker.ts`) runs the extraction pipeline:
   - **Manifest parsing** (no AST needed): reads `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `Dockerfile`, `docker-compose.yml`, K8s manifests, `.kicad_pro` files — extracts dependency names and infra signals only.
   - **Import extraction** (tree-sitter): for `.ts`/`.tsx`/`.js`/`.jsx` and `.py` files, parses AST import declarations. Only module source strings are captured — variable names, function names, and business logic are never read.
   - Falls back to regex-based import extraction when grammar WASM files are unavailable.
3. The worker outputs a **Skeleton JSON** (`lib/skeleton-json.ts`): languages, frameworks, dependency lists, infra flags, KiCad presence — zero proprietary content.
4. The Skeleton JSON is shown to the user for review, then POSTed to Django in Task 2.4 for cloud LLM synthesis into bullet points.

### WASM setup

After `pnpm install`, run the setup script to copy the core WASM and download language grammar files:

```bash
pnpm prepare-wasm    # copies tree-sitter.wasm + downloads grammar WASMs to public/wasm/
```

Files placed in `public/wasm/`:
| File | Source |
|---|---|
| `tree-sitter.wasm` | `node_modules/web-tree-sitter/` (copied automatically) |
| `tree-sitter-javascript.wasm` | GitHub release of tree-sitter-javascript |
| `tree-sitter-typescript.wasm` | GitHub release of tree-sitter-typescript |
| `tree-sitter-python.wasm` | GitHub release of tree-sitter-python |

The worker loads grammars via `Parser.Language.load('/wasm/tree-sitter-*.wasm')`. Missing grammar files trigger the regex fallback — they are not required for the feature to function.

### Key files

| File | Role |
|---|---|
| `lib/skeleton-json.ts` | `SkeletonJson` type — the sanitized output |
| `lib/ast-worker-types.ts` | Message types for main thread ↔ worker |
| `lib/ast-worker.ts` | Web Worker: manifest + import extraction |
| `lib/use-ast-extractor.ts` | React hook managing the worker lifecycle |
| `lib/use-directory-picker.ts` | File System Access API picker (unchanged) |
| `public/wasm/` | WASM grammar files served as static assets |

## Environment Variables

See `env.example`. Create `.env.local` for local development.

| Variable | Purpose |
|---|---|
| `API_URL` | Django API base URL — **server-side only**, never `NEXT_PUBLIC_`. Example: `http://localhost:8000` |
| `NEXT_PUBLIC_*` | Variables that must be available in the browser |
