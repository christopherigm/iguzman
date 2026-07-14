# PRD — Website: from page-builder to per-customer coded sites

Strategy and rationale for reworking the `website` frontend. This is the
historical/strategy record (like `apps/prds/minecraft.md`); the **authoritative
recipe** is `apps/website/sites/CLAUDE.md`.

## Problem

The `website` fullstack app was built so **non-technical customers** could build
their own site through an admin page-builder (`/admin` + `ai-interviewer`). In
practice that asks customers to do design work, and they give up — with reason.
Meanwhile the frontend is **one hard-coded template** (`app/[locale]/page.tsx`)
shared by every tenant and differentiated only by `System` DB fields, so "make
this customer look different" had nowhere to go except more builder tooling.

## Decision

Invert the model, mirroring `mob-forge`: **an expert + a recipe produces a
bespoke artifact**, instead of a non-expert + a builder UI.

- **We (the team) code the frontend** — landing page, sections, structure, UX —
  by hand or with Claude Code, from a recipe (`sites/CLAUDE.md`, `/new-site`).
- **The customer self-edits only the brand kit + content** via the existing
  backend CMS: logo, slogan, colors, hero, About/mission/vision, legal text, and
  catalog content (products, services, categories, variants, brands, stories,
  highlights). Design and structure are no longer theirs to operate.
- **The page-builder is retired** (the `ai-interviewer` / site-structure parts).
  The catalog/brand/content CRUD admin stays — it is genuinely useful and
  data-driven.

### Ownership split

| Layer | Owner | Where |
| --- | --- | --- |
| Landing composition, sections, custom pages, layout, UX, animations | **Team** | `sites/<slug>/` |
| Theme fine-tuning beyond palette | **Team** | `sites/<slug>/` |
| Brand kit: logo, favicon, hero, slogan, name, colors | **Customer** | `System` (CMS) |
| About/mission/vision, legal (privacy/terms/user-data) | **Customer** | `System` (CMS) |
| Products, services, categories, variants, brands, stories, highlights | **Customer** | catalog/core (CMS) |
| Auth, account, verify/reset, i18n, PWA, theme | **Platform (shared)** | app-wide |

## Architecture: single app, host-resolved sites

One `website` app, one Docker image, one Helm release — regardless of tenant
count. Per-customer code grows; **infra stays flat.**

- Each customer = a `sites/<slug>/` folder tied to **one customer and one (or
  more) domain(s)**.
- `sites/registry.ts` builds a **host → site index** from each site's light,
  component-free `site.config.ts`, and **lazy-loads** the resolved site's page
  module so a request only ever ships one tenant's code (code-splitting is what
  makes "exponential tenant growth" a code-organization problem, not an infra
  one).
- `lib/resolve-site.ts` (`getSite`, `React.cache`d) maps the request host to a
  site; `app/[locale]/page.tsx` dispatches the landing, and
  `app/[locale]/[...sitePath]/page.tsx` dispatches optional extra pages at the
  lowest routing priority (never shadowing platform routes).
- Unknown hosts fall back to `sites/_default` — the original generic template,
  now relocated intact — so a provisioned-but-not-yet-built customer still works.

The backend is **already multi-tenant** (`System.host`, FK-scoped catalog, and
`X-Website-Host` resolution) and is unchanged. `pnpm sync-website-hosts` already
makes domain→tenant ingress routing DB-driven; the new frontend structure plugs
directly into that chain (Django `System` → sync hosts → ingress → app resolves
site by host).

## Why not app-per-customer

Considered and rejected for the default path: a build + Docker image + Helm
release per domain makes infra grow linearly with customers — exactly the
"exponential growth" pain to avoid. A future premium tier could still opt a
single high-traffic customer into an isolated deploy, but the norm is the shared
host-resolved app.

## Rollout

1. **Foundation (this effort):** `sites/` registry + resolver, `_default` site,
   `page.tsx` dispatcher + catch-all, `sites/CLAUDE.md` recipe, `/new-site`
   skill + `pnpm new-site` CLI. No behavior change for existing tenants — they
   render via `_default`.
2. **Retire the builder:** freeze/remove `ai-interviewer` and site-structure
   admin; keep content CRUD. (Follow-up.)
3. **Migrate live customers:** build a `sites/<slug>/` per active domain, moving
   each off `_default` onto a bespoke design.
4. **Grow the block library:** calendar, booking, menu, etc. arrive as new
   `components/` blocks + `lib/` helpers; sites opt in by composing them.

## Open items / follow-ups

- Migrate live customers off `_default` onto bespoke `sites/<slug>/` folders.
- Grow the block library: calendar, booking, menu.
- `/api/web-search` route is orphaned (the ollama/groq routes do Tavily inline);
  remove it in a future cleanup if confirmed dead.

## Done

- `lib/` data helpers honor `SiteConfig.systemHost` via `getTenantHost()` so
  preview/staging hosts load the right tenant without a matching `System.host`.
- `ai-interviewer` retired: removed from `admin-form`/`system` page, deleted the
  component dir + the interviewer-only `/api/scraper` route, pruned the dead
  `aiInterview*` i18n keys in all five locales. Content CRUD admin (and its own
  field AI-assist via ollama/groq) is kept.
- `pnpm new-site` documented in the help app across all five locales.
