# CLAUDE.md — Per-Customer Sites (the frontend recipe)

Authoritative recipe for building a **bespoke customer site** in the `website`
app. This is the frontend analog of `apps/mob-forge/CLAUDE.md`: an expert (you,
with Claude Code) hand-builds a unique, well-designed, well-structured site from
a recipe — instead of a non-technical customer driving a page-builder. To author
one end-to-end, use the **`/new-site`** skill; this file is the contract it
follows.

> **The model in one line:** one Next.js app, many sites. Each customer gets a
> `sites/<slug>/` folder tied to **one customer and one (or more) domain(s)**,
> resolved by request host at runtime. Design & structure are ours; the customer
> only self-edits the **brand kit + content** via the backend CMS.

## Where a site lives

```
apps/website/sites/
  types.ts              # SiteConfig / SiteModule / SitePageProps contracts
  registry.ts           # host -> site index + lazy loader (edit to register a site)
  _default/             # the fallback generic template (never matched by host)
    site.config.ts
    landing.tsx
    index.ts
  <slug>/               # ONE folder per customer (e.g. acme, la-cocina)
    site.config.ts      # slug, name, hosts[], systemHost  (light, component-free)
    landing.tsx         # the bespoke "/" composition
    index.ts            # default-exports the SiteModule
    sections/           # site-specific sections (optional)
    pages/              # extra routes: about.tsx, contact.tsx… (optional)
    assets/             # site-specific static imports (optional)
```

`slug` = the folder name = the stable id. **Never** rename a folder without
updating its `registry.ts` entry and `site.config.ts` `slug`.

## What lives here vs. what is shared vs. what is generated

- **Committed, per-site (ours to build):** everything under `sites/<slug>/`.
- **Shared platform (do NOT fork per site):** auth, my-account, admin CMS,
  navbar/footer, the block library in `apps/website/components/`, the data
  helpers in `apps/website/lib/`, i18n, theme. A site *composes* these; it does
  not copy them.
- **Backend (never touched to add a site):** the Django `System` record and its
  catalog/brand/content is created in the Django admin. The frontend only reads
  it by host.

## The host → site → tenant chain (how a domain reaches a site)

Multi-tenancy is **host-based end-to-end**. Adding a customer touches three
places, in order:

1. **Backend:** create a `System` in the Django admin with the customer's
   `host` (their primary domain) + branding + catalog. This is the source of
   truth for the customer's data and the customer's self-edit surface.
2. **Ingress:** run `pnpm sync-website-hosts` — it reads every enabled
   `System.host` from the API and rewrites `apps/website/helm/values.yaml`
   (ingress) + the API's CORS/CSRF/ALLOWED_HOSTS, so the domain routes to this
   one app. (See `scripts/sync-website-hosts.mjs`.)
3. **Frontend:** the `sites/<slug>/` folder + its `registry.ts` entry map that
   host to bespoke code. Until a folder exists, the host safely falls back to
   `_default` (the generic DB-driven template).

`site.config.hosts` must list **every** hostname that should render the site —
the production domain **and** any preview/staging host. `systemHost` is the
`System.host` the backend uses to fetch the customer's data; set it to the
primary production domain so previews on other hostnames still load the right
tenant. The `lib/` data helpers send it as `X-Website-Host` via
`getTenantHost()` (in `lib/resolve-site.ts`), which prefers the resolved site's
`systemHost` and falls back to the raw request host — so a preview domain with
no matching `System.host` still loads the customer's real data.

## Testing a site locally (before deploy)

Resolution is host-based, but `127.0.0.1:3000` matches no site's `hosts`, so
every local request would otherwise fall back to `_default`. To preview a real
site in `pnpm dev`, use the **dev-only site switcher**: a floating dropdown
(bottom-left, rendered only when `NODE_ENV === "development"`) that lists every
registered site. Selecting one writes a `__dev_site` cookie (the site's `slug`)
that `lib/resolve-site.ts` honors **in development only** — `getSite()` resolves
to that slug and `getTenantHost()` follows its `systemHost`, so the backend
loads the right tenant's data too. Choose "Default (by host)" to clear the
cookie. The cookie is ignored in production; real deploys always resolve by
host. This is how you build-and-verify a site *before* the domain/ingress steps
exist. The switcher is wired in `app/[locale]/layout.tsx` from `SITE_CONFIGS`
(exported by `registry.ts`).

## The site contract (`types.ts`)

- `SiteConfig` (in `site.config.ts`) is **light and component-free** — the
  registry imports every config eagerly to build the host index. Do not import
  React or heavy modules here.
- `SiteModule` (default export of `index.ts`) carries the actual page
  components. It is **lazy-loaded**: a request downloads only the one site it
  resolves to. This is what keeps a single deploy cheap at N tenants — never
  defeat it by importing one site's components from another module.
- `Landing` is required (`/`). `pages` is an optional map of extra top-level
  routes (`{ "/about": About, "/contact": Contact }`) served by the
  `[locale]/[...sitePath]` catch-all. Paths that collide with a platform route
  (`auth`, `admin`, `my-account`, `products`, `services`, `categories`, `blog`,
  `highlights`) never reach a site — those explicit routes always win, so don't
  name a site page after one.

## Registering a site (`registry.ts`)

Add the eager config import and one `SITES` entry above the marked lines; keep
`_default` **last** (it is the fallback):

```ts
import acmeConfig from "./acme/site.config";        // <- above <new-site:import>

const SITES: SiteEntry[] = [
  { config: acmeConfig, load: () => import("./acme") },   // <- above <new-site:entry>
  { config: defaultConfig, load: () => import("./_default") },
];
```

`pnpm new-site <domain>` does this insertion for you.

## The block library (backend-connected sections you compose)

Build a site by composing the shared, already-tenant-aware components in
`apps/website/components/` — each resolves the current tenant on its own via the
`lib/` data helpers, so you rarely fetch data by hand. Core blocks:

| Block (`@/components/…`) | Renders | Backend source |
| --- | --- | --- |
| `hero` (`Hero`) | Hero with logo/slogan/video/bg | `System` |
| `success-stories` (`SuccessStories`) | Stories slider | `getSuccessStories()` |
| `company-highlights` (`CompanyHighlights`) | Highlights grid | `getHighlights()` |
| `catalog-categories` (`CatalogCategories`) | Product/service category tiles | `getProductCategories()` / `getServiceCategories()` |
| `catalog-items` (`CatalogItems`) | Featured product/service cards | `getFeaturedProducts()` / `getFeaturedServices()` |
| `buyable-card`, `product-detail`, `service-detail`, `category-detail` | Item/detail rendering | catalog helpers |

Data helpers (all in `apps/website/lib/`, all host-resolved + `React.cache`d):
`getSystem`, `getSuccessStories`/`getSuccessStory`, `getHighlights`/`getHighlight`,
`getProductCategories`, `getServiceCategories`, `getFeaturedProducts`,
`getFeaturedServices`, `getAllProducts`, `getAllServices`, `getProduct`,
`getService`, `getProductsByCategory`, `getServicesByCategory`. **Prefer these
over calling the API directly** — they carry the `X-Website-Host` forwarding and
caching.

A site-specific section that has no shared equivalent goes in
`sites/<slug>/sections/` and may call the same `lib/` helpers. If a section
proves reusable across sites, promote it to `apps/website/components/`.

Future capabilities (calendar, booking, menu…) will arrive as new blocks +
`lib/` helpers here; a site opts in by composing them — the site structure does
not change.

## Styling rules (non-negotiable)

- **Props-first, CSS-last.** Style `@repo/ui` components (`Box`, `Typography`,
  `Button`, `Container`…) with UIComponentProps; a CSS class on a `@repo/ui`
  component may contain **only** pseudo-selectors, transitions/animations,
  `@media` overrides, and `::before`/`::after`. Use the `styles` escape hatch
  for properties props don't cover. This is the repo-wide rule in the root
  `CLAUDE.md` and `packages/ui/CLAUDE.md` — it applies verbatim inside `sites/`.
- Reuse the shared utility classes documented in `apps/website/CLAUDE.md`
  (`.section-title`, `.section-subtitle`, `.zoom-on-hover`, `.card-content`,
  `.elevation-*`, item/detail helpers) instead of re-inventing them.
- Respect light/dark theme (the app is theme-aware via `ThemeProvider`) and
  drive accent color from the tenant's `System.primary_color`/`secondary_color`
  where the design allows, so the customer's brand-kit edits still take effect.
- **Never import from `@repo/ui/core-elements/navbar` in a site's `landing.tsx`,
  `sections/`, or `pages/` — these are Server Components.** That heavy
  `"use client"` navbar module is already loaded once for the whole app via the
  layout's `NavbarClient`; referencing any of its exports (including
  `NavbarSpacer`/`PageBottomSpacer`) again from a server component creates a dual
  client/server reference that trips a React Flight error
  (`enqueueModel is not a function`) during client navigation. To clear the fixed
  navbar at the top of a page, or add bottom breathing room, use **props-first
  padding with the shared CSS vars** on your `Container`/`Box` instead:
  `paddingTop="var(--ui-navbar-height, 57px)"` and
  `paddingBottom="var(--ui-page-bottom-spacing, 64px)"` (both vars are defined by
  the navbar CSS the layout already loads). A page that opens with a full-bleed
  `<Hero>` needs no top padding — the hero already sits under the navbar.

## Quality bar for a site

A site should be **unique, well-designed (UI/UX), well-structured, and easy to
navigate** — that is the whole point of moving design in-house. Concretely:
clear visual hierarchy and a strong hero; sections in a deliberate order (not
just the default stack); responsive with no horizontal body scroll; accessible
headings and alt text; fast (lean on the cached `lib/` helpers, no client-side
waterfalls); and navigation that reflects what the customer actually offers
(hide product/service nav when their counts are zero, as the navbar already
does).

## Editing / removing a site

- **Change composition or design:** edit `sites/<slug>/landing.tsx` and its
  `sections/`. No backend or registry change needed.
- **Add a domain/preview host:** add it to `site.config.hosts` (and create the
  matching `System.host` + re-run `pnpm sync-website-hosts` if it's a real
  public domain).
- **Retire a site:** remove its `registry.ts` entry (it falls back to
  `_default`) before deleting the folder.

## Checklist for a new site

1. `System` exists in Django admin with the customer's `host` + branding/catalog.
2. `pnpm sync-website-hosts` run (domain in ingress + API CORS).
3. `sites/<slug>/` scaffolded (`pnpm new-site <domain>`), `hosts`/`systemHost`
   set in `site.config.ts`.
4. `registry.ts` entry present (CLI-inserted), `_default` still last.
5. `landing.tsx` composed from the block library + any `sections/`, props-first.
6. Extra `pages/` wired into the `SiteModule.pages` map if the customer needs
   them.
7. `pnpm check-types --filter=website` and `pnpm lint --filter=website` clean.
8. Verified by eye in `pnpm dev` via the dev site switcher (select the slug on
   `127.0.0.1:3000`) before deploying — then again at the real host once live.
