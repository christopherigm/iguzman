---
name: seed-site
description: Populate a customer site's INITIAL CONTENT (the backend data the landing page renders) after /new-site has scaffolded the frontend. Runs a business-strategist discovery interview - challenging the operator's assumptions one question at a time until the concept is sharp - then writes a JSON brief and runs the website-api `seed_site` command to create the System copy + success stories + highlights + catalog (products, services, OR menu items for food businesses), with placeholder images and YouTube/links from seed_assets/. Use when the user asks to populate/seed a new site, fill in landing content, or "make the landing look complete" for a customer in the website app (e.g. "/seed-site acme.com").
---

# seed-site — interview-to-populated landing

`/new-site` builds the **frontend** (the `sites/<slug>/` composition). This skill
fills the **content** it renders. The `website` landing is 100 % backend-driven:
`Hero`, `SuccessStories`, `CompanyHighlights`, `CatalogCategories` and
`CatalogItems` all read the Django `System` record + its stories/highlights/
catalog by request host. Your job: through a sharp strategy interview, produce a
**brief** and run the `seed_site` command so the page renders full and alive —
real copy, placeholder images, working YouTube/links — instead of an empty shell.

**Run this in its own Claude session** (separate from `/new-site`) so the long
interview transcript never competes with the frontend build for context. The
target site is named in the arguments after `/seed-site` (a host or customer). If
none is given, ask which site to populate.

## First — choose the interaction language

**Before the interview begins**, ask the operator which language to conduct this
session in — **English or Spanish** — using `AskUserQuestion`. Conduct **all**
subsequent interaction in the chosen language: the entire strategy interview
(every question, every push-back and counter-argument), the concept summary you
read back, and the closing hand-off. **If they pick Spanish, run the whole
interview in Spanish.**

This is the **conversation** language only — it is independent of the site's
content. The brief you write and seed can still be English, Spanish, or bilingual
regardless of which language you interviewed in; whether to fill the bilingual
`en_*` mirror fields is its own decision, made under "Voice & brand" during the
interview.

## Read these FIRST — the contract you fill

- **`apps/website-api/seed_assets/README.md`** — the brief JSON schema, the
  placeholder image pool, `links.json`, and how `seed_site` maps a brief to
  records. **This is the source of truth for field names; do not invent fields.**
- **`apps/website-api/seed_assets/brief.example.json`** — a complete filled
  brief. Copy its shape. **Note:** it illustrates only the product/service
  families. For a **food** business, copy the menu shape from
  **`apps/website-api/seed_assets/briefs/panbueno.iguzman.com.mx.json`** (an
  organic bread maker whose loaves/muffins are `menu_items` with priced
  `ingredients`).
- **`apps/website/sites/CLAUDE.md`** → "Seeding initial content" — how the data
  layer relates to the frontend blocks you are feeding.

## Preconditions

- A `System` for this host may or may not exist yet — `seed_site` **upserts** it
  (creates if missing, updates if present), so you can seed before or after the
  Django admin record is hand-created. It matches on `system.host`; use the
  customer's **primary production domain** (the site's `systemHost`).
- You are writing **data only** — no frontend or backend code. If the composition
  needs to change to show this content well, that is a `/new-site` task.

## Part 1 — The strategy interview (the heart of this skill)

Act as the customer's **business strategist**, and put on the **Project Manager**,
**CFO**, and **CMO** hats whenever the topic demands. Your goal is not to collect
answers politely — it is to **pressure-test the concept until it is sharp enough
to sell.** A landing page seeded from mushy positioning is worthless.

**Rules of the interview:**

1. **One question at a time.** Ask a single, sequential question, wait for the
   answer, then decide the next question from what you heard. Never dump a
   questionnaire. Never batch. (Use plain chat, or `AskUserQuestion` when a
   crisp multiple-choice would move faster — but still one decision per turn.)
2. **Argue. Don't stenograph.** When an answer is vague ("we help businesses
   grow"), a claim is unsubstantiated ("we're the market leader"), pricing is
   hand-wavy, or the ICP is "everyone" — **push back with a specific
   counter-argument and a sharper alternative**, then let the operator defend or
   revise. Steelman the customer's buyer and their competitor.
3. **Cover the concept, in roughly this order**, adapting to answers:
   - **Positioning & ICP** — who exactly is the buyer, what painful problem, why
     now. Reject "everyone."
   - **Offer & differentiation** — the one thing they do that competitors can't
     claim. This becomes the hero slogan + highlights.
   - **Proof (CFO/PM hat)** — concrete outcomes, numbers, named-but-anonymizable
     customers. These become **success stories** (make them quantified and
     specific, not "great experience").
   - **Catalog** — the real offerings, sensible categories, and **realistic
     prices + currency** (CFO: challenge margins/price points that don't add up).
     **First decide which of the three Buyable families this catalog is** (see
     the food rule below) — it changes which brief section you write.
   - **Voice & brand** — tone, primary/secondary colors, bilingual? (fill `en_*`
     mirror fields if the site serves English + Spanish).
   - **Assets** — do they have a hero video (YouTube), logo, real photos? If not,
     confirm you'll use the `seed_assets/` placeholder pool and they swap later.
4. **Know when to stop.** When you can state the positioning in one sentence, name
   the ICP, list 3 quantified proof points, and 4–6 highlights and a real
   catalog — **stop interviewing and summarize the concept back** in a short brief
   for the operator to confirm before you build.

Keep it efficient: a good interview is ~6–12 sharp exchanges, not 40 timid ones.

### The food rule — pick the right Buyable family before you write catalog

The backend has **three** purchasable families, each its own brief section and
model (full reference: `apps/website/sites/CLAUDE.md` → "The three Buyable
families"). Choosing wrong makes the catalog un-seedable-correctly, so settle it
*during* the Catalog part of the interview:

- **`product_categories` → products** — physical/shippable goods (SKU, stock).
- **`service_categories` → services** — booked/performed work (duration, modality).
- **`menu_categories` → menu items** — **food.**

**When the business sells food, use `menu_categories`, never `product_categories`.**
A restaurant, **bakery / bread** maker, café, juice bar, taquería, cloud kitchen,
caterer, or anyone selling meals/dishes/drinks is a **menu** business. The reason
is the data model, not the vibe: a `MenuItem` carries a **base `price` plus priced
`ingredients`** the customer customises (add nuts +$25, double patty, hold the
cheese) — which the seed populates — plus an *internal* recipe the operator adds
later in the CMS. A `Product` can express none of this. Model a bakery's bread as
a product and you silently throw away ingredient customisation.

- **When it's genuinely mixed or ambiguous, ask the operator** rather than
  guessing — a shop selling packaged goods *and* made-to-order food, a bakery that
  also sells branded merch, "a store for my restaurant." One `System` can carry
  all three families at once (the catalog blocks fold them together), so the
  answer can legitimately be "both" — but confirm it, don't assume.
- This is a first-class interview decision. Fold it into the Catalog questioning
  (e.g. "Is what you sell prepared food, or packaged/physical goods?") and let the
  answer pick the brief section you write in Part 2.

## Part 2 — Build the brief & seed

5. **Write the brief.** Translate the agreed concept into a brief JSON at
   `apps/website-api/seed_assets/briefs/<host>.json`, following
   `brief.example.json` exactly. Guidelines:
   - Copy is **customer-specific and concrete** — real slogans, quantified
     stories, benefit-led highlight text. This is the whole point; do not ship
     the example's Acme text.
   - Leave every `image` field pointing at pool files (`placeholder-N.jpg`) or
     omit it (the command round-robins the pool). Only set a named asset if the
     operator actually provided a file in `seed_assets/`.
   - Prices realistic; `is_featured` stays true so items surface in `CatalogItems`.
   - **Write the catalog section the food rule picked** — `product_categories`,
     `service_categories`, and/or `menu_categories`. For `menu_categories`, give
     each `menu_item` its `ingredients` list: mark base components
     `is_default: true` at `price: 0`, and each add-on `is_default: false` with a
     realistic per-unit `price` (and `max_quantity` for "double X"). Leave the
     internal recipe out — the seed doesn't populate `recipe_steps`.
   - Fill `en_*` fields only when the site is bilingual.
6. **Run the seeder** from `apps/website-api`:
   ```bash
   python manage.py seed_site --brief seed_assets/briefs/<host>.json --reset
   ```
   `--reset` wipes this System's prior seeded content first, so re-running after a
   revision is clean. (Django venv must be active — see `apps/website-api`.)
7. **Verify by eye.** Start the app (`pnpm dev --filter=website`), open
   `http://127.0.0.1:3000/`, and use the **dev-only site switcher** (bottom-left)
   to select this site's slug so the local host resolves to it. Confirm the hero,
   stories, highlights, and catalog all render populated. Iterate: refine the
   brief, re-run with `--reset`.

## Notes

- **This seeds the _local_ DB only.** Once the operator has verified the site
  locally, publishing it to production is a separate step: `pnpm publish-site
<host>` serializes this content out of the local DB and upserts it into the prod
  Django (placeholder images skipped — the customer uploads real ones via the
  CMS). See `apps/website/sites/CLAUDE.md` → "Publishing to production". Not part
  of this skill; just point the operator to it when the seed looks good.
- If the operator later drops real images into `seed_assets/`, point the relevant
  brief `image` fields at them and re-run with `--reset` — no code change.
- Do not create Django models/endpoints or edit the frontend here. Content only.
- Slugs are auto host-namespaced by the command; never hand-write global slugs.
