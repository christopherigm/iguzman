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
  routes (`{ "/about": About, "/wholesale": Wholesale }`) served by the
  `[locale]/[...sitePath]` catch-all. Paths that collide with a platform route
  never reach a site — those explicit routes always win, so don't name a site
  page after one.

**The reserved platform routes** (everything under `app/[locale]/`, all of which
a site gets for free and must not re-implement):

| Route                                        | What it already is                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `auth`, `account`, `admin`                   | Sign-in/up, the customer's profile, the CMS                                 |
| `products`, `services`, `food`, `categories` | Catalog listing + detail for all three Buyable families                     |
| `blog`, `highlights`                         | Editorial + highlight detail pages                                          |
| **`events`**                                 | The tenant's events archive + each event's own page (see below)             |
| `cart`, `favorites`, `orders`                | Guest + signed-in cart, hearts, checkout confirmation & history             |
| **`contact`**                                | The tenant's branches/map, contact email, social links, and a contact form  |
| **`pos`**                                    | The admin-only point-of-sale till (see "Capabilities a site gets for free") |

**Do not build a site-local `/contact` page.** `app/[locale]/contact/page.tsx` is
a platform route: it renders the tenant's `Branch` locations (single-location
view or a grid, each with an `OsmMap` — OpenStreetMap tiles drawn into the page,
whose pin wears the tenant's `img_brandmark`), `System.contact_email`, `social_links`
via `@repo/ui`'s `SocialLinks`, and the shared `ContactForm` — all resolved by
request host and all self-editable in the CMS (`/admin/branches`,
`/admin/system`). A `"/contact"` entry in a `pages` map is silently
unreachable; three sites carried one as dead code until it was removed. Link to
`/contact` from the landing instead — which is what the shared **`FindUs`** block
below does, and it reuses that page's own location cards to do it, so the landing
shows the same branch cards and maps rather than a second, thinner rendering of
the same rows.

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

## The three Buyable families — pick the right one

The backend catalog has **three** purchasable families, all subclasses of
`Buyable` (same `price`/`currency`/`brand`/`image`), each with its own category,
detail page, and cart/checkout wiring:

| Family        | Backend model (`catalog/models.py`) | For                                             | The thing that earns it its own model                                                                                                     |
| ------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Product**   | `Product` + `ProductVariant`        | Physical/tangible goods, shippable inventory    | SKU, stock count, dimensions/weight; fixed **variants** (Size=L, Color=Red) each a distinct priced SKU                                    |
| **Service**   | `Service` + `ServiceVariant`        | Booked/performed work                           | Duration, modality (online/in-person); variants are session lengths/packages                                                              |
| **Menu item** | `MenuItem` + `MenuItemIngredient`   | **Food** — restaurants, bakeries, cafés, drinks | Priced **ingredient customisation** (base price + per-add-on deltas via `price_for_selection`), dietary flags, and an **internal** recipe |

**Decision rule — when the business sells food, use MenuItem, not Product.**
A restaurant, bakery/**bread** maker, café, juice bar, taquería, cloud kitchen,
caterer, or anyone selling meals/dishes/drinks is a **menu** business: model its
catalog as `MenuCategory` + `MenuItem`, **never** as products. The reason is the
model, not the vibe — food is _customised by priced ingredients_ (add nuts +$25,
double patty, hold the cheese) and carries an _internal kitchen recipe_, neither
of which a `Product` can express. A `MenuItem`'s `price` is the **base**; the
customer's ingredient picks add up-charges on top, and that selection travels
through the cart into the order snapshot. See the reference brief
**`apps/website-api/seed_assets/briefs/elpanbueno.com.json`** (an
organic bread maker whose loaves and muffins are MenuItems with priced add-ins)
and the built site **`sites/panorganico/`**.

**When it's genuinely mixed or ambiguous, ask the user** rather than guessing —
e.g. a shop selling both packaged goods _and_ made-to-order food, a bakery that
also sells branded merch, or "a store for my restaurant." One `System` can carry
all three families at once (the catalog blocks fold them together), so the answer
can be "both" — but confirm it; don't silently model a bakery's bread as products
and lose the ingredient customisation. Guidance for the seed strategy interview
that decides this lives in the **`/seed-site`** skill.

## The block library (backend-connected sections you compose)

Build a site by composing the shared, already-tenant-aware components in
`apps/website/components/` — each resolves the current tenant on its own via the
`lib/` data helpers, so you rarely fetch data by hand. Core blocks:

| Block (`@/components/…`)                                                             | Renders                                                              | Backend source                                                               |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `hero` (`Hero`)                                                                      | Landing hero, logo/slogan/video/bg                                   | `System` (see "The hero is a tenant composition")                            |
| `section-hero` (`SectionHero`)                                                       | Section/page hero for a **non**-landing page                         | `System.hero_text_frame` + `img_brandmark`                                   |
| `about-intro` (`AboutIntro`)                                                         | "Story + photo" two-column intro                                     | passed in resolved (`System.about` / `img_about`) + your own CTAs            |
| `success-stories` (`SuccessStories`)                                                 | Stories slider                                                       | `getSuccessStories()`                                                        |
| `events` (`Events`)                                                                  | Dated happenings slider (upcoming, then recent past)                 | `getUpcomingEvents()` / `getPastEvents()`                                    |
| `company-highlights` (`CompanyHighlights`)                                           | Highlights grid                                                      | `getHighlights()`                                                            |
| `catalog-categories` (`CatalogCategories`)                                           | Product/service/menu category tiles                                  | `getProductCategories()` / `getServiceCategories()` / `getMenuCategories()`  |
| `catalog-items` (`CatalogItems`)                                                     | Featured product/service/food cards                                  | `getFeaturedProducts()` / `getFeaturedServices()` / `getFeaturedMenuItems()` |
| `spotlight` (`Spotlight`)                                                            | Editorial promo panel + a hand-picked trio of items                  | `System.spotlight_*` + `spotlight_items` refs                                |
| `homepage-flyers` (`HomepageFlyers`)                                                 | The tenant's promo slides, each its own band + up to two items       | `getHomepageFlyers()` (`HomepageFlyer` rows, band and all)                   |
| `buyable-card`, `product-detail`, `service-detail`, `menu-detail`, `category-detail` | Item/detail rendering                                                | catalog helpers                                                              |
| `menu-item-customizer`, `nutrition-label`                                            | Priced-ingredient picker + FDA panel                                 | `getMenuItem()` (its `ingredients`, `portions`)                              |
| `section-band` (`SectionBand`)                                                       | Full-width band behind a section                                     | `System.*_bg` + `System.*_top_divider` / `*_bottom_divider`                  |
| `find-us` (`FindUs`)                                                                 | "Where to find us": the branch cards + their maps + a `/contact` CTA | `getBranches()` (+ `System.img_brandmark` for the pin)                       |
| `empty-catalog-state` (`EmptyCatalogState`)                                          | "Nothing here" + browse CTAs + categories                            | `System.*_count`                                                             |

**Wrap a banded section in `SectionBand`, never a bare `<Box styles={{ width:
"100%", background }}>`.** It carries the tenant's band background _and_ the
shape-divider notch they picked for the band's top and bottom edges (so the page
and its watermark show through instead of a hard line). Pass the site's own
fallback band colour as `background` exactly as before — see any
`sites/*/landing.tsx` and `apps/website/CLAUDE.md` → "Section background bands".

**`Spotlight` is the block that breaks a landing's card-grid monotony.** It is a
single bordered panel — label → title → text → CTA on one side, three
hand-picked catalog cards on the other — so it reads as a different _shape_ from
the grids around it (see the "variety" point in the quality bar). It is entirely
DB-driven: the tenant fills the copy and picks the trio in
`/admin/featured-spotlight`, and the block **renders nothing** until it has both
a title and at least one still-live item. So `<Spotlight />` is safe to compose
into any landing before the content exists — it simply stays invisible.
`cafedealtura` uses it as a wholesale invitation, `panorganico` as a vegan-bread
showcase; one component, two completely different sections.

**`HomepageFlyers` is the same idea, several times over — and one band each.**
Where `Spotlight` is one panel on the `System` row, a flyer is a *record*: a
tenant authors as many as they like in `/admin/homepage-flyers`, and each carries
its own photograph, its own copy, its own **background and edge shapes**, and up
to **two** catalog items. That is the whole reason it is a model — a set of
slides sharing one band would read as one panel whose contents change. It renders
nothing until the tenant makes one, and it reads as a plain section until they
make a second (the shared `SliderControls` draws nothing for a single slide), so
`<HomepageFlyers />` is safe to compose into any landing before the content
exists. Every site carries it, upper-middle: after `<Spotlight />` where there is
one, otherwise just above the highlights band. The photograph sits left or right
from `sm` up, per flyer — below that the slide always stacks title → photograph →
copy → the two item cards.

**`<FindUs />` closes every landing, and its cards are the contact page's own.**
It answers the one question none of the other blocks does — _where are you_ — with
the tenant's `Branch` rows, main location first: a single location renders as the
prominent detail-plus-map view, several as the grid of branch cards, each with its
`PlaceMap`, its call/WhatsApp/email row and its directions link. It renders
`components/contact/contact-locations.tsx` itself rather than a landing-shaped
imitation, so a branch that gains coordinates gains its map on both surfaces at
once (the hand-built name-and-address list this replaced on `tamaratours` had
neither the map nor the contact row). It is a **pointer to `/contact`, not a copy
of it** — no form, no social links, just the CTA through. All four strings default
to the shared **`FindUs`** message namespace, so `<FindUs />` needs no props; a
site with its own voice for this beat passes them (`tamaratours`'
`sections/departure.tsx` is the thin wrapper that does, calling it the departure
point). Admin edit/remove controls are deliberately off here — those belong on
`/contact` and `/admin/branches`, not one mis-tap away on the storefront's landing.

**`<Events />` is safe to compose blind too**, alongside `Spotlight`,
`SuccessStories` and `FindUs`: it renders **nothing** until the tenant has an
event, so every landing carries it and nothing appears until the CMS has one. It
is entirely DB-driven (`/admin/events`) and it brings two platform routes with
it — `/events` (the archive) and `/events/<slug>` (one event) — plus a navbar
link the layout gates on `System.event_count`. All six landings place it
**after the catalog and before the highlights band**, so a visitor meets what
the business sells before what it is putting on; keep new sites in that slot
unless the page's rhythm argues otherwise.

⚠ **Never re-derive "is this event over?" in a site.** The API decides it against
each event's own timezone — and, for an all-day event, against the end of its
local day, since one is stored at midnight and a `new Date(...) < Date.now()`
would retire it on the morning it runs. Read `event.is_past`, and format every
instant through the helpers in `lib/event-shared.ts`, which all take the event's
`timezone` and none of which falls back to the browser's.

**`AboutIntro` is a shared block, not a per-site section.** If a site needs the
"short story beside a photo" intro, compose `@/components/about-intro` and pass
the resolved copy/image plus the site's own `Button`/`LinkButton` children —
don't re-write the two-column split in `sections/`. `bdrone`, `panorganico`,
`supertortaselchino` (`sections/intro.tsx`) and `cafedealtura`
(`sections/origin.tsx`) are all thin wrappers around it.

**A non-landing page's hero is `SectionHero`, not `Hero`.** It is the shared
`@repo/ui` `Hero` plus the tenant's opt-in outline **text frame**
(`System.hero_text_frame` + `img_brandmark`). The landing hero deliberately does
**not** go through it — that one is `@/components/hero` — so the frame only ever
lands on secondary section/detail headings the tenant asked for.

**The two catalog blocks auto-fold all three [Buyable](#the-three-buyable-families--pick-the-right-one) families.** `CatalogCategories` and `CatalogItems` each fetch products, services **and** menu items in one pass, tag every card with its `kind` (`"product" | "service" | "food"`), and render whatever exists — a food-only business gets a menu-only landing from the same block, and a family with zero rows is simply omitted (never a blank section). You do **not** compose a separate "menu" block; put `<CatalogItems />` / `<CatalogCategories />` in the landing and the food shows up when the backend has it.

Data helpers (all in `apps/website/lib/`, all host-resolved + `React.cache`d):
`getSystem`, `getSuccessStories`/`getSuccessStory`, `getHighlights`/`getHighlight`,
`getProductCategories`, `getServiceCategories`, `getFeaturedProducts`,
`getFeaturedServices`, `getAllProducts`, `getAllServices`, `getProduct`,
`getService`, `getProductsByCategory`, `getServicesByCategory`, and — for the
food family — `getMenuCategories`/`getMenuCategory`, `getFeaturedMenuItems`,
`getAllMenuItems`, `getMenuItemsByCategory`, `getMenuItem` (all in
`lib/catalog.ts`), plus `getBranches` (`lib/branches.ts` — the tenant's physical
locations, main one first). **Prefer these over calling the API directly** — they
carry the `X-Website-Host` forwarding and caching.

A site-specific section that has no shared equivalent goes in
`sites/<slug>/sections/` and may call the same `lib/` helpers. If a section
proves reusable across sites, promote it to `apps/website/components/`.

Future capabilities (calendar, booking…) will arrive as new blocks + `lib/`
helpers here; a site opts in by composing them — the site structure does not
change. (The **menu/food** family already landed this way — see "The three
Buyable families" above.)

## The hero is a tenant composition — you pick the hierarchy, not the pixels

`@/components/hero` reads **every** visual knob off `System`: the video/image,
the logo badge (`hero_video_layout`, `hero_logo_background`, `hero_logo_scale`,
`hero_logo_background_scale`), the darkening (`hero_overlay_style` /
`hero_overlay_opacity` / `hero_overlay_extent`) and the bottom shape divider
(`hero_bottom_divider`, `hero_bottom_divider_elevation`). The tenant tunes all of
it in `/admin/logos-and-styles`, whose preview renders the **real** `Hero` — so
whatever they see there is what ships.

A site therefore passes only the three **composition** props, which are design
decisions rather than settings:

```tsx
<Hero
  system={system}
  splitSlogan          // first slogan line = headline, the rest = quieter subline
  align="start"        // left-align the text, cap its measure (logo stays centred)
  actions={hasFood && <Button text={…} href={MENU_ALL_PATH} kind="primary" size="lg" />}
/>
```

**Never add a `scrim`.** The website wrapper deliberately does not expose the
shared `Hero`'s `scrim` prop: the CMS preview knows only about the tenant's
overlay, so any per-site scrim makes the live hero darker than the preview and
reads to the customer as "the overlay setting is ignored." If a hero needs more
darkening, that is `hero_overlay_opacity`/`hero_overlay_style` in the CMS (or the
seed brief), not code. Three sites once carried a scrim; it was removed for
exactly this reason.

**Gate `actions` on a real count.** `system.product_count` / `service_count` /
`menu_item_count` decide whether a CTA has anywhere to go — an ungated CTA lands
on an empty listing before the catalog is seeded.

**A food CTA points at `MENU_ALL_PATH` (`/menu`), never a path literal.** The
menu is one listing — `/menu`, the whole thing — plus a page per category at
`menuCategoryHref(slug)`. Both live in `lib/catalog-paths.ts`; never build one
by concatenation. A products or services CTA is the same story one family over:
`CATALOG_ROOT.product` / `CATALOG_ROOT.service`, never `"/products"` typed out. There used to be five
per-kind listings beside it (`/categories/{food,drinks,desserts,sides,appetizers}`)
backed by a `MenuItem.kind` enum; the enum is gone and a menu is sectioned by the
tenant's own categories now, so **to feature one section — a drinks band on a
cantina's landing — read `getMenuCategories()` and pick the category**, then
filter `getAllMenuItems()` by `item.category`. `sites/santofishrestaurant/sections/bar.tsx`
is the worked example, and ⚠ its docstring is worth reading first: with no
structural per-item field left, choosing "the bar" is a name match, and it fails
soft (renders nothing) rather than dressing the panel with the wrong food.

## Shape dividers — the seam treatment, and who owns it

`@repo/ui/shape-divider` cuts a **real transparent notch** out of one edge of a
box (`wave`, `scallop`, `zigzag`, `spikes`, `arches`, `slant`, `inverted-slant`),
so the page background and its logo watermark show through instead of the section
meeting its neighbour at a hard horizontal line. Two things follow from "real
hole": the mask clips **every** descendant, and elevation is a `drop-shadow`
tracing the notch (a `box-shadow` would be clipped flat).

**In a site you never call it directly.** Both places a landing has a seam are
already wired to tenant fields:

- the **hero's bottom edge** → `System.hero_bottom_divider` (+ its elevation),
  applied by `@/components/hero`;
- each **band's top and bottom edge** → `System.catalog_*_divider` /
  `highlights_*_divider`, applied by `SectionBand` (bands get both edges because
  a band has a section above _and_ below; the hero only ever dissolves downward).

So pass the tenant's values straight through — `topDivider={system?.catalog_top_divider}`
— and let an unset field mean a straight edge. Do **not** hand-write a
`mask-image`, and do not wrap a section in your own `ShapeDivider` to "add a
wave": the CMS previews would no longer match the site, which is the same failure
mode as the hero scrim above.

If the hero uses the `profile` layout, its logo disc is already lifted by the
notch depth (`shapeDividerEdgeInset`) so it keeps straddling the visible edge —
never compensate for that again per-site.

## Capabilities a site gets for free (don't rebuild these)

Composing a landing is the whole frontend job. These platform features arrive
with the app and are already tenant-scoped; a new site inherits them the moment
its `System` exists:

| Capability                      | Where                                                        | What the site does                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Contact & branches**          | `/contact`, `/admin/branches`                                | Link to `/contact`. Never build one (see the reserved-routes table).                                                                 |
| **Cart & checkout**             | `/cart`, `/orders/[id]`, Stripe                              | Nothing — `BuyableCard` already carries add-to-cart/buy-now. Stripe keys are per-tenant and live in Django.                          |
| **Guest cart & favorites**      | `localStorage` + `/api/guest/resolve`                        | Nothing. A visitor needs no account to save or buy.                                                                                  |
| **POS till**                    | `/pos` (admin-only)                                          | Nothing. A counter-sale screen over the same catalog, guarded by `proxy.ts` **and** an `isAdmin` check. Just don't shadow the route. |
| **Social flyers**               | `/admin/social-posts`                                        | Nothing. The tenant generates Instagram/story flyers for a catalog item from a code-defined template registry.                       |
| **Per-tenant fonts**            | `System.google_font_url` + `font_display`/`font_body`        | Nothing — the locale layout publishes `--font-display`/`--font-body`. **Never hardcode a `font-family` in a site.**                  |
| **Watermark & page background** | `System.watermark_*`, `background_light`/`_dark`             | Keep it visible: don't paint an opaque full-width background outside a `SectionBand`.                                                |
| **Legal pages**                 | `System.privacy_policy`, `terms_and_conditions`, `user_data` | Nothing — the footer links them. Seed the copy, don't write a site page.                                                             |

**The social-flyer templates are shared, not per-site.** `components/admin/social-templates/registry.ts`
lists six code-defined templates (`classic`, `bold`, `minimal`, `editorial`,
`sale`, `profile`); the DB stores only the `id`, so adding one is a component
plus a registry entry with no migration. If a customer wants a new flyer look,
**add a template to that shared registry** — never fork it into `sites/<slug>/`,
which the CMS would never see. The `profile` template reuses the same badge
shapes as the hero (`components/admin/logo-background-options.ts`), so a flyer
and the hero stay recognisably one brand.

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
- **The photos are fetched, not placeholders.** `fetch_seed_images` (run by
  `/seed-site` before the seed) pulls a real photo per record from **Pexels**,
  falling back to **Pixabay**, using an `image_query` the skill writes on each
  record during the interview — because a dish named "Hawaiana" or a highlight
  named "Nuestro Compromiso" is not a searchable term, but "ham and pineapple
  sandwich" is. Both banks license commercially, so these can be the site's real
  imagery, and each record stores the credit it owes in `attribution` /
  `attribution_url`. The storefront footer carries one bank credit for as long as
  `System.stock_image_count > 0`, and it disappears by itself as the customer
  replaces the photos in the CMS. Full guidance: `seed_assets/README.md`.
- **What it creates:** upserts the `System` (by host) + its copy/colors/video,
  then success stories, highlights, and any of the three catalog families the
  brief includes: `product_categories` → products, `service_categories` →
  services, and **`menu_categories` → menu items** (each dish carrying its
  `ingredients` list of priced add-ins/defaults, plus optional `recipe` steps).
  Featured items (`is_featured=True`) surface in `CatalogItems`. Pick the family
  that fits the business (see "The three Buyable families" above) — a **food**
  business's brief uses `menu_categories`, not `product_categories`. Its shape is
  in `seed_assets/README.md`'s schema block (`brief.example.json` illustrates only
  the product/service families). Note that `briefs/` is git-ignored, so a brief
  another session wrote is not in the repo — read the README, not a sibling brief.
- **The brief also carries the brand kit and the design settings**, not just
  copy. `brief["system"]` copies **any** field in `core/site_payload.SYSTEM_TEXT_FIELDS`
  verbatim, which now includes the hero composition (`hero_video_layout`,
  `hero_logo_background`, `hero_logo_scale`, `hero_logo_background_scale`,
  `hero_text_frame`), the hero overlay trio (`hero_overlay_style` /
  `_opacity` / `_extent`), every divider (`hero_bottom_divider` + its elevation,
  `catalog_top_divider` / `catalog_bottom_divider`, `highlights_top_divider` /
  `highlights_bottom_divider`), the watermark + page background
  (`watermark_*`, `background_light`, `background_dark`), typography
  (`google_font_url`, `font_display`, `font_body`), contact details
  (`contact_email`, `social_links`), the `spotlight_*` promo copy, and the legal
  pages. **That is why a landing needs no per-site design constants** — seed the
  tenant's look once and every block, and every CMS preview, agrees with it.
  Two things the brief cannot seed: `spotlight_items` (item ids are picked in the
  CMS) and physical `Branch` locations.
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
pnpm publish-site <host>           # e.g. pnpm publish-site bdrone.com.mx
pnpm publish-site <host> --images  # send the photographs too
pnpm publish-site <host> --reset   # exact replace of the System's prior content
```

`publish-site` serializes the site's `System` + success stories + highlights +
the product/service/menu catalog out of the local DB (via `apps/website-api`'s
`export_site` command → `core/site_payload.py`) and POSTs it to the production
`POST /api/publish-site/` endpoint (admin Basic auth, like `sync-website-hosts`),
which **upserts** it by host + slug. Key properties:

- **Menu items publish with their priced `ingredients`, but not their recipe.**
  A food site's `MenuCategory`/`MenuItem` catalog travels like products/services
  do; each dish carries its ingredient add-ins/defaults so customised pricing
  works in prod. The **internal `recipe_steps` are kitchen IP** and are neither
  seeded nor published — the customer maintains them in the prod CMS.

- **Images travel only with `--images`, and only into empty fields.** By default
  the payload is text and every image field in prod is left alone — the historical
  behaviour. With `--images`, `export_site` writes every referenced file into
  `exports/<host>-images.zip` (the same shape `core/backup.py` uses) and it rides
  alongside the JSON as a multipart part. On the far side a record with **no
  image yet** is given the one it had locally; a record that **already has one
  keeps it**. That fill-don't-clobber rule is the whole safety story: a customer
  who replaced a seeded photo with their own must not lose it because somebody
  re-published a typo fix. ⚠ `--reset` is the exception, and it is louder than it
  used to be — it deletes the rows first, so a reset publish replaces the
  customer's uploaded images too.
- **This is what makes the seeded photography worth publishing.** `/seed-site`
  fills a brief from Pexels/Pixabay, both of which license commercially, so the
  site can launch with the imagery the customer approved instead of forty
  hand-uploads. The credit each photo owes (`attribution` / `attribution_url` on
  every record, `img_hero_attribution` on `System`) is ordinary text and travels
  in the payload **whether or not** `--images` is passed — a published bank photo
  with its credit left behind in dev is the one failure mode this feature has.
- **The design settings travel with the content.** The same
  `SYSTEM_TEXT_FIELDS` the brief fills are what `export_site` serializes, so the
  hero composition/overlay/dividers, band dividers, watermark, page backgrounds,
  fonts, contact details and legal copy all land in prod — the site does not need
  a second round of CMS tuning to look like the local one.
- **Two things deliberately stay per-environment:** `spotlight_items` (item ids
  differ between databases, so the tenant re-picks the trio in the prod CMS — the
  spotlight _copy_ does publish) and physical `Branch` locations.
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
- **Never hardcode a `font-family`.** Type is a tenant setting
  (`System.google_font_url` + `font_display`/`font_body`); the locale layout
  publishes `--font-display` (headings) and `--font-body` (body), and an unset
  tenant falls back to the platform Roboto. A site picks the _hierarchy_
  (`Typography` `variant`), never the typeface.
- **Never re-derive a tenant setting the CMS previews.** The hero overlay, the
  hero/band shape dividers, the watermark and the page backgrounds each have a
  CMS section that renders the **real** component. A site-local reimplementation
  (a hand-written scrim, a hand-written mask, an opaque page background) makes
  the live site and the preview disagree, and the customer reports it as "my
  setting does nothing." Pass the field through; change the field, not the code.
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
   identical card grids stacked. Reach for `Spotlight` (a bordered panel, not a
   grid) and an `AboutIntro` split to break the rhythm, and let the tenant's
   `SectionBand` dividers soften the seams. **Hide sections the customer has no
   data for** (zero products ⇒ no product section/nav, as the navbar already
   does) and never invent content to fill a template.
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
3. `landing.tsx` composed from the block library + any `sections/`, props-first —
   including `SectionBand` for banded sections (with the tenant's divider fields
   passed through), `<Spotlight />` where the landing needs a non-grid beat, and
   `<FindUs />` closing the page.
4. Extra `pages/` wired into the `SiteModule.pages` map if the customer needs
   them — and **not** named after a reserved platform route (no site `/contact`;
   link to the shared one).
5. Initial content seeded **locally** with **`/seed-site <host>`** (separate
   session) so the landing renders full — hero, stories, highlights, catalog —
   instead of blank, **and** so the brand kit (fonts, overlay, dividers,
   watermark, page backgrounds) is set on the `System` rather than in code. See
   "Seeding initial content" above.
6. `pnpm check-types --filter=website` and `pnpm lint --filter=website` clean.
7. Verified by eye in `pnpm dev` via the dev site switcher (select the slug on
   `127.0.0.1:3000`) — the landing **and** the free `/contact` page, in light and
   dark.
8. **Publish content to prod:** redeploy `website-api`, then
   `pnpm publish-site <host> --images` (creates the prod `System` + content, and
   carries the seeded photography into any image field still empty there). Drop
   `--images` to publish text only. See "Publishing to production" above.
9. `pnpm sync-website-hosts` (now that the `System` exists in prod, its `host`
   lands in ingress + API CORS).
10. Redeploy `website`; verify at the real host once live.
