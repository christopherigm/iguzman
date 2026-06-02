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
  (auth)/                 — login, signup, verify-email, reset-password
  (dashboard)/            — Authenticated area (guarded by middleware)
    matrix/               — Immutable Matrix: manage bullet points
    applications/         — Job application tracker & tailoring
    extract/              — Local codebase extraction (OPFS + WebGPU)
    profile/              — User profile settings
```

Authentication guard (redirect unauthenticated users) lives in `proxy.ts` alongside the next-intl middleware.

## Edge AI — OPFS + WebGPU

The "Extract Experience" feature runs inference entirely in the browser:

- The service worker (`app/sw.ts`) silently fetches and caches Gemma 4b weights into the **Origin Private File System (OPFS)** during onboarding.
- Client-side inference uses **WebGPU** (`navigator.gpu`) — gate all WebGPU code behind a feature check.
- OPFS reads/writes must run in a **Web Worker** (not the main thread).
- Only NDA-sanitized metadata (stack names, metrics, patterns — no variable names, logic, or proprietary names) is ever sent to the Django backend.

## Environment Variables

See `env.example`. Create `.env.local` for local development.

| Variable | Purpose |
|---|---|
| `API_URL` | Django API base URL — **server-side only**, never `NEXT_PUBLIC_`. Example: `http://localhost:8000` |
| `NEXT_PUBLIC_*` | Variables that must be available in the browser |
