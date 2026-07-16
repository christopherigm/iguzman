# CLAUDE.md — Per-Customer Sites (the frontend recipe)

Authoritative recipe for building a **bespoke customer site** in the `website`
app. This is the frontend analog of `apps/mob-forge/CLAUDE.md`: an expert (you,
with Claude Code) hand-builds a unique, well-designed, well-structured site from
a recipe — instead of a non-technical customer driving a page-builder. To author
one end-to-end, use the **`/new-site`** skill; this file is the contract it
follows. For the **visual craft** — how to make a landing look genuinely
designed and avoid the machine-generated look — read the **`/site-design`**
skill (the design playbook); the "Styling rules" and "Quality bar" sections
below are its enforced summary.

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
    components/         # site-local special components, e.g. a bespoke CTA
                        #   variant — built from @repo/ui, NOT a fork of it (optional)
    pages/              # extra routes: about.tsx, contact.tsx… (optional)
    assets/             # site-specific static imports (optional)
```

`slug` = the folder name = the stable id. **Never** rename a folder without
updating its `registry.ts` entry and `site.config.ts` `slug`.

## What lives here vs. what is shared vs. what is generated

- **Committed, per-site (ours to build):** everything under `sites/<slug>/`.
- **Shared platform (do NOT fork per site):** auth, account, admin CMS,
  navbar/footer, the block library in `apps/website/components/`, the data
  helpers in `apps/website/lib/`, i18n, theme. A site _composes_ these; it does
  not copy them.
- **Backend (never touched to add a site):** the Django `System` record and its
  catalog/brand/content is created in the Django admin. The frontend only reads
  it by host.

## The host → site → tenant chain (how a domain reaches a site)

Multi-tenancy is **host-based end-to-end**. Adding a customer touches three
places, in order:

1. **Backend:** a `System` exists with the customer's `host` (their primary
   domain) + branding + catalog — created either by `pnpm publish-site` (see
   "Publishing to production") or by hand in the Django admin. This is the source
   of truth for the customer's data and the customer's self-edit surface.
2. **Ingress:** run `pnpm sync-website-hosts` — it reads every enabled
   `System.host` from the API and rewrites `apps/website/helm/values.yaml`
   (ingress) + the API's CORS/CSRF/ALLOWED_HOSTS, so the domain routes to this
   one app. (See `cli/website/website.sh sync`.)
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
host. This is how you build-and-verify a site _before_ the domain/ingress steps
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
  (`auth`, `admin`, `account`, `products`, `services`, `categories`, `blog`,
  `highlights`) never reach a site — those explicit routes always win, so don't
  name a site page after one.

## Registering a site (`registry.ts`)

Add the eager config import and one `SITES` entry above the marked lines; keep
`_default` **last** (it is the fallback):

```ts
import acmeConfig from "./acme/site.config"; // <- above <new-site:import>

const SITES: SiteEntry[] = [
  { config: acmeConfig, load: () => import("./acme") }, // <- above <new-site:entry>
  { config: defaultConfig, load: () => import("./_default") },
];
```

`pnpm new-site <domain>` does this insertion for you.

## The block library (backend-connected sections you compose)

Build a site by composing the shared, already-tenant-aware components in
`apps/website/components/` — each resolves the current tenant on its own via the
`lib/` data helpers, so you rarely fetch data by hand. Core blocks:

| Block (`@/components/…`)                                              | Renders                        | Backend source                                      |
| --------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| `hero` (`Hero`)                                                       | Hero with logo/slogan/video/bg | `System`                                            |
| `success-stories` (`SuccessStories`)                                  | Stories slider                 | `getSuccessStories()`                               |
| `company-highlights` (`CompanyHighlights`)                            | Highlights grid                | `getHighlights()`                                   |
| `catalog-categories` (`CatalogCategories`)                            | Product/service category tiles | `getProductCategories()` / `getServiceCategories()` |
| `catalog-items` (`CatalogItems`)                                      | Featured product/service cards | `getFeaturedProducts()` / `getFeaturedServices()`   |
| `buyable-card`, `product-detail`, `service-detail`, `category-detail` | Item/detail rendering          | catalog helpers                                     |

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

## Seeding initial content (the data layer)

The blocks above render **nothing** until the backend has data: a `System`
record and its stories/highlights/catalog. Scaffolding a `sites/<slug>/` folder
gives you the _composition_; the _words and images_ come from the DB, matched by
host. To populate a new site's **initial content** end-to-end, use the
**`/seed-site`** skill (a separate Claude session — it runs a strategy interview,
then seeds), which drives the backend command:

```bash
cd apps/website-api
python manage.py seed_site --brief seed_assets/briefs/<host>.json --reset
```

- **Where content lives:** `apps/website-api/seed_assets/` — a placeholder image
  **pool** (`placeholder-*.jpg`), named branding assets (hero/about/logo/
  manifest), `links.json` (YouTube + outbound URLs), and `brief.example.json`
  (the schema by example). The per-customer brief goes in `seed_assets/briefs/`.
- **Images are files, not URLs.** Every `img_*`/`image` field on `System`,
  `SuccessStory`, `CompanyHighlight`, `ProductCategory`/`Product`,
  `ServiceCategory`/`Service` is a Django **`ImageField`** (media file). Only
  `System.video_link` (YouTube) and `href` are true URLs. `seed_site` copies
  files from `seed_assets/` into `MEDIA_ROOT` and links each record; unset image
  fields round-robin the pool, so a seeded page never shows a blank slot.
- **What it creates:** upserts the `System` (by host) + its copy/colors/video,
  then success stories, highlights, product & service categories with featured
  products/services (`is_featured=True` so they surface in `CatalogItems`).
- `--reset` wipes that System's prior seeded content for clean, idempotent
  re-runs. Slugs are auto host-namespaced to avoid global collisions.
- **Frontend seeding vs. backend seeding:** this skill/command is the _only_
  place to populate content. Do **not** hard-code copy or images into
  `landing.tsx` — that bypasses the customer's CMS self-edit surface. The
  customer later refines everything in the admin CMS; the seed is their starting
  point, not a frozen frontend.

## Publishing to production (the dev → prod content sync)

`/seed-site` populates your **local** dev database so you can build and verify a
site. Once it's tested, **publish its content to production** with:

```bash
pnpm publish-site <host>          # e.g. pnpm publish-site bdrone.com.mx
pnpm publish-site <host> --reset  # exact replace of the System's prior content
```

`publish-site` serializes the site's `System` + success stories + highlights +
product/service catalog out of the local DB (via `apps/website-api`'s
`export_site` command → `core/site_payload.py`) and POSTs it to the production
`POST /api/publish-site/` endpoint (admin Basic auth, like `sync-website-hosts`),
which **upserts** it by host + slug. Key properties:

- **Images are not transported.** Every image is a Django `ImageField` (a file),
  not portable data — so the placeholder pool stays in dev. The customer uploads
  real images in the prod CMS. A re-publish **never clobbers** an image already
  set on an existing record (image fields are left untouched on update); `--reset`
  wipes the System's prior content first for a clean replace.
- **It writes to prod, so it confirms first** (skip with `-y`).
- **Deploy ordering:** the `/api/publish-site/` endpoint ships in the
  **website-api image**, so redeploy website-api _before_ publishing. Then, per
  new site: (1) `pnpm publish-site <host>` creates the prod `System` + content →
  (2) `pnpm sync-website-hosts` picks up the now-existing `System.host` for
  ingress + CORS → (3) redeploy `website` if you added a new `sites/<slug>/`.

This replaces the "hand-create the System in the Django admin" step for a new
customer — publishing creates it. You can still edit everything afterward in the
admin CMS; a later re-publish only refreshes text content, preserving CMS images.

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
- Respect light/dark theme (the app is theme-aware via `ThemeProvider`). **The
  layout already drives the theme `--accent` from the tenant's
  `System.primary_color`** (`app/[locale]/layout.tsx`), so brand color flows into
  every core component automatically — a `<Button kind="primary">` is _already_
  the customer's brand color. Never re-pass the brand color to a core Button.
- **Core-element purity — never restyle `@repo/ui`, extend it in the site.** Use
  core elements with their own props first: `<Button kind="primary" size="lg" />`
  for the brand CTA, `<Button size="lg" />` for a neutral secondary,
  `<LinkButton />` for a low-emphasis link — no `unstyled`, no hand-rolled
  padding/`borderRadius`/`elevation`/hover CSS. If you truly need a variant the
  core element lacks (outline CTA, stat tile, icon pill), build a **named
  site-local component** in `sites/<slug>/components/` and use it there — do
  **not** edit anything under `packages/ui/src/core-elements/` for one site's
  look. If you typed `unstyled` on a `<Button>` in a `landing.tsx`/`sections/`/
  `pages/` file, stop and use a prop or a site-local component instead.
- **Avoid the machine-generated look.** No purple/violet/magenta as a default
  accent or in gradients (drive color from the real brand); no
  `transform: translateY(-Npx)` / `scale()` hover lifts (signal interactivity
  with color/shadow/opacity instead); no diagonal multi-stop gradient bands
  ("gradient soup") — use a solid `backgroundColor="var(--surface-2)"` band for
  section rhythm; no emoji-as-icons; no faux copy/stats (content is DB-driven).
  The full tell-list, craft rubric, and per-business-type layout archetypes live
  in the **`/site-design`** skill. Reference exemplar: **`sites/bdrone/`**.
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

A site should look like a studio hand-built it for **that one business** —
unique, calm, and free of the tells that mark a page as machine-generated. A
page that could be any business, or that screams "AI made this," fails the bar
even if it compiles and lints clean. Check every landing against this rubric
(the `/site-design` skill expands each point with examples and archetypes):

1. **Hierarchy.** Exactly one `h1` (the hero); section titles are `h2` and
   don't compete with it. One clear focal point per viewport. Hierarchy comes
   from the `Typography` `variant` scale — never hand-set `fontSize`.
2. **Type discipline.** Body copy is `variant="body"` (never the removed
   `body-sm`); `caption` only for genuine metadata. Adjust `fontWeight`/`color`,
   not size.
3. **Color restraint.** One brand accent (`--accent`, already tenant-driven) plus
   neutral tokens (`--foreground`, `--background`, `--surface-2`, `--border`,
   `--muted-foreground`). Accent is for emphasis (primary CTA, active state, one
   highlight) — not for filling large areas. **No purple defaults, no gradient
   soup.**
4. **Spacing rhythm.** One reused vertical section-padding value; related items
   grouped tight, sections separated generously; alternate plain / `--surface-2`
   bands so the eye has rhythm.
5. **Deliberate structure & variety.** Section order tells the customer's story
   (pick the archetype for their business type — services, restaurant, product,
   portfolio, local); adjacent sections differ in shape and background — not five
   identical card grids stacked. **Hide sections the customer has no data for**
   (zero products ⇒ no product section/nav, as the navbar already does) and never
   invent content to fill a template.
6. **Core-element purity & no AI tells.** CTAs are core `Button`/`LinkButton`
   with `kind`/`size` (no `unstyled` hacks); a needed variant is a site-local
   component, never restyled shared code. No `translateY`/`scale` hover lifts, no
   emoji icons, no faux copy.
7. **Responsive, theme-aware, accessible, fast.** No horizontal body scroll at
   any width; verified in **both light and dark**; real `alt` text and correctly
   nested headings; lean on the cached `lib/` helpers with no client-side
   waterfalls.

## Editing / removing a site

- **Change composition or design:** edit `sites/<slug>/landing.tsx` and its
  `sections/`. No backend or registry change needed.
- **Add a domain/preview host:** add it to `site.config.hosts` (and create the
  matching `System.host` + re-run `pnpm sync-website-hosts` if it's a real
  public domain).
- **Retire a site:** remove its `registry.ts` entry (it falls back to
  `_default`) before deleting the folder.

## Checklist for a new site

Build & verify locally, then publish to prod:

1. `sites/<slug>/` scaffolded (`pnpm new-site <domain>`), `hosts`/`systemHost`
   set in `site.config.ts` (`systemHost` = the customer's primary domain).
2. `registry.ts` entry present (CLI-inserted), `_default` still last.
3. `landing.tsx` composed from the block library + any `sections/`, props-first.
4. Extra `pages/` wired into the `SiteModule.pages` map if the customer needs them.
5. Initial content seeded **locally** with **`/seed-site <host>`** (separate
   session) so the landing renders full — hero, stories, highlights, catalog —
   instead of blank. See "Seeding initial content" above.
6. `pnpm check-types --filter=website` and `pnpm lint --filter=website` clean.
7. Verified by eye in `pnpm dev` via the dev site switcher (select the slug on
   `127.0.0.1:3000`).
8. **Publish content to prod:** redeploy `website-api`, then
   `pnpm publish-site <host>` (creates the prod `System` + content; images
   skipped). See "Publishing to production" above.
9. `pnpm sync-website-hosts` (now that the `System` exists in prod, its `host`
   lands in ingress + API CORS).
10. Redeploy `website`; verify at the real host once live.
