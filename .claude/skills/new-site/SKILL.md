---
name: new-site
description: Build a bespoke per-customer site in apps/website end-to-end — scaffold the sites/<slug>/ folder, register it by host, and hand-code a unique, well-designed landing (and extra pages) composed from the shared block library and connected to the multi-tenant backend. Use when the user asks to create/add a customer website, landing page, or onboard a new domain in the website app (e.g. "/new-site acme.com", "/new-site a landing for La Cocina restaurant").
---

# new-site — prompt-to-live customer site

Author a bespoke customer site in `apps/website` from a natural-language brief.
One customer = one `sites/<slug>/` folder tied to one (or more) domain(s),
resolved by request host. **We design and code the frontend; the customer only
self-edits the brand kit + content via the backend CMS.**

**The site to build is described in this skill's arguments** (the text after
`/new-site` — a domain, a customer name, and/or a design brief). If no domain or
customer was given, ask for one before starting.

## Read these FIRST — source of truth, do not duplicate their contents

- **`apps/website/sites/CLAUDE.md`** — the authoritative recipe: the site
  contract (`SiteConfig`/`SiteModule`), the host→site→tenant chain, the block
  library + `lib/` data helpers, registration in `registry.ts`, styling rules,
  and the checklist. Follow it verbatim; **if it conflicts with this skill,
  CLAUDE.md wins.**
- **`apps/website/sites/_default/`** — the reference implementation (a valid
  `site.config.ts` + `landing.tsx` + `index.ts`); mirror its structure.
- Root **`CLAUDE.md`** styling rule (props-first, CSS-last) and
  `apps/website/CLAUDE.md` shared utility classes.

## Preconditions

- The customer's **`System`** should already exist in the Django admin (its
  `host`, branding, and catalog are the customer's data + self-edit surface). If
  it does not yet, note it as a required backend step — the site will still
  render via the DB-driven blocks once the System exists, and falls back to
  `_default` until then.
- You are building **frontend only**; do not add backend models/endpoints here.

## Pipeline

1. **Confirm identity.** Resolve the primary **domain**, a folder **slug**
   (kebab-case, derived from the domain/customer), the **customer name**, and
   any preview hosts. Read the design brief for tone, sections, and any extra
   pages (about, contact, later menu/booking).
2. **Scaffold.** Run `pnpm new-site <domain>` (it creates `sites/<slug>/` from
   the `_default` shape and inserts the `registry.ts` import + entry, keeping
   `_default` last). If the CLI is unavailable, create the folder by hand
   mirroring `_default/` and register it per `sites/CLAUDE.md`.
3. **Configure.** Fill `site.config.ts`: `slug`, `name`, all `hosts` (production
   + preview), and `systemHost` (the customer's `System.host`).
4. **Design the landing.** Rework `landing.tsx` into a unique, well-structured
   composition — deliberate section order, strong hero, clear hierarchy — built
   from the block library (`@/components/*`) and cached `lib/` data helpers.
   Site-specific sections go in `sites/<slug>/sections/`. **Props-first, CSS-last**
   on every `@repo/ui` component. Keep it responsive, theme-aware, and driven by
   the tenant's `System` colors where the design allows.
5. **Extra pages (if briefed).** Add components under `sites/<slug>/pages/` and
   wire them into the `SiteModule.pages` map (`{ "/about": About }`). Never name
   one after a platform route (auth, admin, my-account, products, services,
   categories, blog, highlights). **These pages are Server Components: never
   import from `@repo/ui/core-elements/navbar` (no `NavbarSpacer`/
   `PageBottomSpacer`).** To clear the fixed navbar / add bottom spacing, use
   props-first padding with the shared CSS vars —
   `paddingTop="var(--ui-navbar-height, 57px)"` /
   `paddingBottom="var(--ui-page-bottom-spacing, 64px)"` on the page's
   `Container`/`Box`. Importing that heavy `"use client"` module into a server
   page trips a React Flight error during client navigation. See the styling
   rules in `sites/CLAUDE.md`.
6. **Verify.** `pnpm check-types --filter=website` and `pnpm lint --filter=website`
   must be clean. Review the composition against the "Quality bar for a site"
   in `sites/CLAUDE.md`. Confirm the design by eye **before deploying**: run
   `pnpm dev --filter=website`, open `http://127.0.0.1:3000/`, and use the
   dev-only **site switcher** (bottom-left dropdown, development only) to select
   this site — it sets the `__dev_site` cookie so the local host resolves to the
   new folder instead of `_default`. (Production still resolves purely by host.)
7. **Hand off the domain step.** Remind the operator that a real public domain
   also needs its `System.host` created and `pnpm sync-website-hosts` run so the
   ingress routes it to this app.

## Notes

- Do not fork shared platform pieces (navbar, footer, auth, admin, block
  library, `lib/` helpers) into a site — compose them. If a site-specific
  section proves reusable, promote it to `apps/website/components/`.
- Never defeat code-splitting: a site must not import another site's modules,
  and `site.config.ts` must stay component-free.
