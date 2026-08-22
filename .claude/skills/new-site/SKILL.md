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

## First — choose the interaction language

**Before any other step**, ask the operator which language to conduct this
session in — **English or Spanish** — using `AskUserQuestion`. Conduct **all**
subsequent interaction in the chosen language: every question, confirmation,
summary, and hand-off message you write to the operator. **If they pick Spanish,
everything you say to the operator is in Spanish** (the questions in the pipeline
below, the design review, the closing instructions — all of it).

This is the **conversation** language only. It does **not** change the code you
write, identifier/slug conventions, or the site's own content language — a
Spanish-speaking operator can still be building an English or bilingual site, and
the bilingual `en_*` seed fields are decided separately in `/seed-site`.

## Read these FIRST — source of truth, do not duplicate their contents

- **`apps/website/sites/CLAUDE.md`** — the authoritative recipe: the site
  contract (`SiteConfig`/`SiteModule`), the host→site→tenant chain, the block
  library + `lib/` data helpers, registration in `registry.ts`, styling rules,
  and the checklist. Follow it verbatim; **if it conflicts with this skill,
  CLAUDE.md wins.**
- **`apps/website/sites/_default/`** — the reference implementation (a valid
  `site.config.ts` + `landing.tsx` + `index.ts`); mirror its structure. For a
  **built** site to copy the shape of, read `sites/supertortaselchino/` (food) or
  `sites/bdrone/` (services) — both are current: a flat list of blocks with the
  band colour and the tenant's dividers passed as props, `Hero` with
  `splitSlogan`/`align`/`actions`, `Spotlight`, and an `AboutIntro`-based
  `sections/intro.tsx`.
- Root **`CLAUDE.md`** styling rule (props-first, CSS-last) and
  `apps/website/CLAUDE.md` shared utility classes.
- **`/site-design`** skill — the design playbook (visual quality bar, the
  anti-"AI-generated-look" rules, core-element purity, craft rubric, and
  per-business-type layout archetypes). **Invoke it in step 4 before composing.**

## Preconditions

- The customer's **`System`** should already exist in the Django admin (its
  `host`, branding, and catalog are the customer's data + self-edit surface). If
  it does not yet, note it as a required backend step — the site will still
  render via the DB-driven blocks once the System exists, and falls back to
  `_default` until then.
- You are building **frontend only**; do not add backend models/endpoints here.

## What the site already has — build the landing, not the platform

A `sites/<slug>/` folder is **a landing composition and (rarely) an extra page.**
Everything else in the customer's site ships with the app, already tenant-scoped
by request host. Do not rebuild any of it, and do not name a site page after one:

| Reserved route                               | Already there                                                         |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `auth`, `account`, `admin`                   | Sign-in/up, customer profile, the CMS                                 |
| `products`, `services`, `food`, `categories` | Catalog listing + detail for all three Buyable families               |
| `blog`, `highlights`                         | Editorial + highlight detail pages                                    |
| `cart`, `favorites`, `orders`                | Guest **and** signed-in cart, hearts, Stripe checkout + order history |
| **`contact`**                                | Branches/map, contact email, social links, shared contact form        |
| **`pos`**                                    | Admin-only point-of-sale till over the same catalog                   |

> ⚠ **Never add a `"/contact"` entry to a site's `pages` map.** `/contact` is a
> platform route and always wins, so the file is silently unreachable — three
> sites carried one as dead code before it was removed. The shared page already
> renders this tenant's `Branch` locations, `contact_email`, `social_links` and a
> working contact form. **Link to `/contact`** from the landing instead.

Two more capabilities worth mentioning to the operator at hand-off, since they
need no site code at all: **`/pos`** (an admin-only till for counter sales) and
**`/admin/social-posts`** (a flyer generator that renders a catalog item into one
of six shared templates for Instagram/stories). If a customer wants a new flyer
look, that is a component + one entry in the **shared**
`components/admin/social-templates/registry.ts` — never a fork inside a site,
which the CMS would never see.

## The food family — recognise a menu business

The catalog has three Buyable families (full reference:
`apps/website/sites/CLAUDE.md` → "The three Buyable families"): **products**
(physical goods), **services** (booked work), and **menu items** (**food**). A
restaurant, **bakery / bread** maker, café, juice bar, taquería, cloud kitchen or
caterer is a **menu** business — its catalog is `MenuItem`s (base price + priced
`ingredients`), not products. What this means for the **frontend** you build here:

- **Composition doesn't change** — `CatalogItems` and `CatalogCategories` already
  auto-fold all three families and render whatever the backend has, tagging each
  card with its `kind` (`"product" | "service" | "food"`). You do **not** build a
  separate menu block; just compose the shared catalog blocks and the food shows
  up once seeded. Detail rendering is `menu-detail` + `menu-item-customizer`.
- **The design archetype does change** — a food business uses the
  restaurant/food layout archetype in `/site-design`, not the product-store one.
- **The catalog content is seeded as `menu_categories`** by `/seed-site` (step 7),
  which owns the product-vs-menu decision for the data. When the business is
  clearly food, tell that session it's a menu business; when it's genuinely mixed
  or ambiguous (packaged goods _and_ made-to-order food), flag it so the operator
  is asked rather than guessed at — one `System` can carry all three families.

## Pipeline

1. **Confirm identity.** Resolve the primary **domain**, a folder **slug**
   (kebab-case, derived from the domain/customer), the **customer name**, and
   any preview hosts. Read the design brief for tone, sections, and any extra
   pages (about, contact, booking). **Note the business type** — in particular,
   whether it's a **food** business (restaurant, bakery/bread, café, taquería,
   caterer…), because that picks the food design archetype in step 4 and means
   its catalog is **menu items**, not products (see "The food family" below).
2. **Scaffold.** Run `pnpm new-site <domain>` (it creates `sites/<slug>/` from
   the `_default` shape and inserts the `registry.ts` import + entry, keeping
   `_default` last). If the CLI is unavailable, create the folder by hand
   mirroring `_default/` and register it per `sites/CLAUDE.md`.
3. **Configure.** Fill `site.config.ts`: `slug`, `name`, all `hosts` (production
   - preview), and `systemHost` (the customer's `System.host`).
4. **Design the landing.** **First invoke the `/site-design` skill** and follow
   it — pick the layout archetype for the customer's business type (a **food**
   business uses the restaurant/food archetype — see "The food family" above),
   apply the craft rubric, and avoid the AI-look tells. Rework `landing.tsx` into a unique,
   well-structured composition — deliberate section order, strong hero, clear
   hierarchy — built from the block library (`@/components/*`) and cached `lib/`
   data helpers. Site-specific sections go in `sites/<slug>/sections/`; a bespoke
   component variant (e.g. an outline CTA) goes in `sites/<slug>/components/`,
   built from `@repo/ui` — never a fork of it. **Props-first, CSS-last** on every
   `@repo/ui` component; use core `Button`/`LinkButton` with `kind`/`size` (the
   layout already drives `--accent` from the tenant brand — no `unstyled` hacks).
   Keep it responsive, theme-aware, no purple defaults, no `translateY` hovers,
   no gradient soup.

   **Four things the current block library gives you — use them:**

   - **A landing is a flat list of blocks — no `<Container>`, no `<SectionBand>`,
     and never a `paddingY` of your own.** Each block renders its own
     `LandingSection`, which carries the page gutter, the symmetric
     `--section-space` rhythm and the optional band — so a section spaces itself
     identically wherever it lands and **re-ordering is moving one line**. A
     banded section is a **prop**: pass the band colour and the tenant's two
     divider fields to the block, and it forwards them to `SectionBand`, which
     cuts the notch into the band's top and bottom edges so the page and its
     watermark show through instead of a hard line.

     ```tsx
     <CatalogItems
       background={fitSectionBackground(system?.catalog_items_bg || band)}
       topDivider={system?.catalog_top_divider}
       bottomDivider={system?.catalog_bottom_divider}
     />
     ```

     A **site-local** section in `sections/` renders `LandingSection` itself (see
     `lacocinaderosalinda/sections/firma.tsx`), **after** its own "nothing to
     show" guard — a block that returns `null` must contribute no empty section.

   - **`<Spotlight />`** — a bordered promo panel (label → title → text → CTA)
     beside a hand-picked trio of catalog cards. It is the block that stops a
     landing reading as five stacked grids, it is entirely DB-driven, and it
     **renders nothing** until the tenant fills the copy and picks items in
     `/admin/featured-spotlight` — so composing it early costs nothing.
   - **`AboutIntro`** (`@/components/about-intro`) for the "short story beside a
     photo" beat: wrap it in a thin `sections/intro.tsx` that resolves `System` +
     translations and passes your own CTA children. Don't re-write the split.
   - **The hero's composition props.** `@/components/hero` reads every visual
     knob (logo badge, overlay, bottom divider) off `System`; a site passes only
     `splitSlogan` (first slogan line = headline, rest = quieter subline),
     `align="start"`, and `actions` — **gated on a real count**
     (`system.menu_item_count` / `product_count` / `service_count`) so the CTA
     never lands on an empty listing.

   **Two hard don'ts, same reason:** never pass a `scrim`, and never hand-write a
   `mask-image` or wrap a section in your own `ShapeDivider`. The CMS previews
   render the _real_ `Hero`/`SectionBand` from the tenant's fields, so any
   site-local darkening or notch makes the live site disagree with the preview and
   reads to the customer as "my setting does nothing." Change the field (in the
   CMS or the seed brief), not the code. Likewise never hardcode a `font-family` —
   type is `System.google_font_url` + `font_display`/`font_body`.

5. **Extra pages (if briefed).** Add components under `sites/<slug>/pages/` and
   wire them into the `SiteModule.pages` map (`{ "/about": About }`). Never name
   one after a reserved platform route — see the table above; **`/contact` in
   particular is already a platform page**, so a site `pages/contact.tsx` is dead
   code. In practice `/about` and a genuinely bespoke page (e.g.
   `cafedealtura`'s `/wholesale`) are all a site needs. A page's own heading hero
   is **`SectionHero`** (it carries the tenant's opt-in outline text frame), not
   the landing `Hero`. **These pages are Server Components: never
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
7. **Populate initial content _and the brand kit_ (separate call).** This skill
   builds the **frontend only** — the landing renders blank until the backend
   `System` + stories/highlights/catalog exist. Hand off to the **`/seed-site`**
   skill **in a fresh Claude session** to run the business-strategy interview and
   seed that content (it writes a brief and runs `website-api`'s `seed_site`
   command, using the `seed_assets/` placeholder pool). Keeping it a separate call
   stops the long interview transcript from eating this build's context.

   Note this is where the site's **look** gets set too, not just its words: the
   brief fills the typography, hero overlay + bottom divider, the two bands'
   dividers, the watermark and the page backgrounds on the `System`. So if the
   landing you just built looks flat (hard section seams, default Roboto, an
   unreadable hero), that is a seeding step, not a code change. Note anything
   specific you want for this business and pass it along with:
   _"run `/seed-site <domain>` in a new session to populate the landing."_

8. **Hand off the domain step.** Remind the operator that a real public domain
   also needs its `System.host` created and `pnpm sync-website-hosts` run so the
   ingress routes it to this app.
9. **Hand off the free capabilities.** Tell the operator what the customer now
   has without asking: the shared **`/contact`** page (fill it by adding branches
   in `/admin/branches` + contact email/social links in the CMS), **`/pos`** for
   counter sales, and **`/admin/social-posts`** for Instagram/story flyers. These
   are frequently assumed to be missing because they are not on the landing.

## Notes

- Do not fork shared platform pieces (navbar, footer, auth, admin, block
  library, `lib/` helpers) into a site — compose them. If a site-specific
  section proves reusable, promote it to `apps/website/components/`.
- Never defeat code-splitting: a site must not import another site's modules,
  and `site.config.ts` must stay component-free.
