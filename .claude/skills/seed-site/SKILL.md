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
  families and only the core copy fields. For a **food** business, take the
  `menu_categories` shape from the README's schema block. For the design/brand-kit
  fields, see "Set the look, not just the copy" in Part 2 below.
- **`apps/website-api/core/site_payload.py` → `SYSTEM_TEXT_FIELDS`** — the
  definitive list of what `brief["system"]` may contain. `seed_site` copies
  **every** field in that tuple verbatim when present, so it is the real schema;
  the README is its prose summary.

> `seed_assets/briefs/` is **git-ignored** — a brief written by another session
> is not in the repo. Don't go looking for a sibling brief to copy; read the
> README and `brief.example.json`.

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
   - **Promo beat (the Spotlight)** — is there one thing they'd push right now: a
     wholesale invitation, a seasonal line, the vegan range, a bundle? If so you
     have a `spotlight_*` panel to fill (label, title, text, button label + link);
     the three items themselves are picked in the CMS, not seeded. If there isn't
     one, say so and leave the fields out — the block hides itself.
   - **Where and how to reach them** — a contact email and their real social
     handles (`contact_email`, `social_links`) fill the shared `/contact` page and
     the footer. Physical **branches** are seeded separately by the operator in
     `/admin/branches`; flag that as a to-do rather than inventing addresses.
   - **Voice & brand** — tone, primary/secondary colors, **typeface**, bilingual?
     (fill `en_*` mirror fields if the site serves English + Spanish). On the
     typeface: ask what the brand should _sound_ like in type (editorial and
     warm? technical and neutral? hand-made?) and propose **one concrete Google
     Fonts pairing** — a display face for headings and a quieter text face for
     body — rather than asking the operator to name fonts cold. See the
     typography note under Part 2.
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
_during_ the Catalog part of the interview:

- **`product_categories` → products** — physical/shippable goods (SKU, stock).
- **`service_categories` → services** — booked/performed work (duration, modality).
- **`menu_categories` → menu items** — **food.**

**When the business sells food, use `menu_categories`, never `product_categories`.**
A restaurant, **bakery / bread** maker, café, juice bar, taquería, cloud kitchen,
caterer, or anyone selling meals/dishes/drinks is a **menu** business. The reason
is the data model, not the vibe: a `MenuItem` carries a **base `price` plus priced
`ingredients`** the customer customises (add nuts +$25, double patty, hold the
cheese) — which the seed populates — plus an _internal_ recipe the operator adds
later in the CMS. A `Product` can express none of this. Model a bakery's bread as
a product and you silently throw away ingredient customisation.

- **When it's genuinely mixed or ambiguous, ask the operator** rather than
  guessing — a shop selling packaged goods _and_ made-to-order food, a bakery that
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
     each `menu_item` its `ingredients` list: leave base components as
     `is_removable: false` (the default — included in the base `price`, locked),
     and mark each optional add-on `is_removable: true` with a realistic per-unit
     `price` (and `max_quantity` for "double X"). **The category is the only
     sectioning a menu has, and every item must be under one** — it groups
     `/categories/menu`, fills the navbar's Menu dropdown and is the first
     segment of the item's URL (`/menu/<category>/<slug>`). So name the
     categories the way the customer's own printed menu is divided (Pizzas,
     Bebidas, Postres…), not generically: there is no separate `kind` field
     behind them any more, and a storefront section that wants "the drinks" now
     finds them by category. Optionally set `portions` on a `menu_item` (servings the dish yields) to
     drive the per-serving nutrition label. Leave the internal recipe out — the
     seed doesn't populate `recipe_steps`.
   - Fill `en_*` fields only when the site is bilingual.
   - **Fill the promo panel** when the interview found one: `spotlight_enabled`,
     `spotlight_label`, `spotlight_title`, `spotlight_text`,
     `spotlight_button_label`, `spotlight_button_link` (+ their `en_*` mirrors).
     **Do not try to seed `spotlight_items`** — item ids are per-database, so the
     trio is picked in `/admin/featured-spotlight`; tell the operator to pick it.
     With no title and no picked items the block renders nothing, which is the
     right outcome for a business with nothing to push.
   - **Fill the contact details** — `contact_email` and `social_links` (the
     tenant's real handles). They feed the shared `/contact` page and the footer.
     Physical locations are **`Branch` records the brief cannot create**; leave
     them to `/admin/branches` and say so at hand-off.
   - **Seed the legal copy** if the operator has it: `privacy_policy`,
     `terms_and_conditions`, `user_data` (+ `en_*`). The footer links these, so an
     unseeded site has three dead links.
   - **Set the typography** — `google_font_url` plus `font_display` (headings)
     and `font_body` (body text). One `css2?family=A&family=B&display=swap` URL
     loads both families; the two name fields say which is which, so both names
     **must** appear in the URL. Rules:
     - The URL must be on `fonts.googleapis.com` — the API rejects any other
       host, because the site renders it into a `<link rel="stylesheet">`.
     - Request only the weights the site uses (`Karla:wght@400;500;700`), not
       the whole family — every extra weight is bytes on first paint.
     - Always end with `&display=swap` so text paints in the fallback while the
       font loads.
     - Omit all three to keep the platform default (Roboto). Naming only
       `font_body` is legitimate — a single-family site gets it for headings too.
     - Pick for the business, not for novelty, and **never** default to the
       geometric-sans-plus-purple look `/site-design` calls out. A farm or an
       artisan reads well in a soft serif (Fraunces, Bitter) over a quiet
       grotesque (Karla, Source Sans 3); a technical B2B product usually wants
       one neutral sans in two weights.

### Set the look, not just the copy

**The brief is where a site's visual settings live** — `/new-site` deliberately
hardcodes none of them, because each has a CMS section whose preview renders the
_real_ component, and a site-local override would make the live page disagree
with what the customer sees while editing. So a landing that looks flat, hard-
edged or unreadable is almost always an **unfilled brief**, not a code problem.

Fill these in `brief["system"]` alongside the copy. All of them are optional and
all have sane defaults — set the ones the business actually calls for, and say
why in your summary rather than sprinkling them at random.

| Field(s)                                                                                                                                                                           | Decides                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero_overlay_style` (`none`/`full`/`bottom`/`top`/`both`/`vignette`), `hero_overlay_opacity` (0-100), `hero_overlay_extent` (0-100)                                               | How far and how dark the hero photo/video is dimmed. **This is the only hero darkening there is** — raise it when a busy food or landscape photo swallows the slogan. Defaults `bottom`/75/50. `extent` does nothing to `full`. |
| `hero_video_layout` (`default`/`none`/`profile`), `hero_logo_background`, `hero_logo_scale`, `hero_logo_background_scale`                                                          | How the logo sits over the hero — centred badge, dropped entirely (for a video that already carries the branding), or a profile disc straddling the bottom edge.                                                                |
| `hero_bottom_divider` (a shape name or `none`), `hero_bottom_divider_elevation` (0-24)                                                                                             | The notch that dissolves the hero into the page below instead of a hard horizontal line.                                                                                                                                        |
| `catalog_top_divider` / `catalog_bottom_divider`, `highlights_top_divider` / `highlights_bottom_divider`                                                                           | The same notch on each band's **top and bottom** edge (a band has a section above _and_ below).                                                                                                                                 |
| `catalog_items_bg`, `highlights_bg`                                                                                                                                                | The two bands' background. Keep them neutral — a tinted `--surface-2`, not a brand gradient (see `/site-design`).                                                                                                               |
| `watermark_enabled`, `watermark_rotation`, `watermark_size`, `watermark_spacing`, `watermark_opacity`, `watermark_intercalated`, `watermark_show_logo`, `watermark_show_brandmark` | The tenant's logo tiled faintly behind every public page. It shows _through_ the band notches, so it pairs with the dividers.                                                                                                   |
| `background_light`, `background_dark`                                                                                                                                              | The page background per theme (the hero's profile disc is painted with it, so it reads as a hole through the video).                                                                                                            |
| `hero_text_frame`                                                                                                                                                                  | The outline frame around section/detail page headings (`SectionHero`) — never the landing hero.                                                                                                                                 |

The divider shapes are `wave`, `scallop`, `zigzag`, `spikes`, `arches`, `slant`,
`inverted-slant` (and `none`). Pick **one** shape and reuse it across the hero
and both bands — a different notch on every edge is the seam equivalent of
gradient soup. Match it to the brand: `wave`/`arches` read soft and organic
(bakery, café, wellness), `slant`/`inverted-slant` read modern and editorial
(agency, B2B), `scallop` reads hand-made, `spikes`/`zigzag` are loud and rarely
right. **A straight edge is a legitimate answer** — leave the fields out for a
site whose calm is the point.

6. **Run the seeder** from `apps/website-api`:
   ```bash
   python manage.py seed_site --brief seed_assets/briefs/<host>.json --reset
   ```
   `--reset` wipes this System's prior seeded content first, so re-running after a
   revision is clean. (Django venv must be active — see `apps/website-api`.)
7. **Verify by eye.** Start the app (`pnpm dev --filter=website`), open
   `http://127.0.0.1:3000/`, and use the **dev-only site switcher** (bottom-left)
   to select this site's slug so the local host resolves to it. Confirm the hero,
   stories, highlights, and catalog all render populated, **in both light and
   dark** — the watermark, page backgrounds and band tints are per-theme and a
   value that reads well in one can be invisible in the other. Check `/contact`
   too (it renders the `contact_email`/`social_links` you just seeded). Iterate:
   refine the brief, re-run with `--reset`.

## Notes

- **This seeds the _local_ DB only.** Once the operator has verified the site
  locally, publishing it to production is a separate step: `pnpm publish-site
<host>` serializes this content out of the local DB and upserts it into the prod
  Django (placeholder images skipped — the customer uploads real ones via the
  CMS). See `apps/website/sites/CLAUDE.md` → "Publishing to production". Not part
  of this skill; just point the operator to it when the seed looks good.
- If the operator later drops real images into `seed_assets/`, point the relevant
  brief `image` fields at them and re-run with `--reset` — no code change.
- **The design settings publish with the content.** `publish-site` serializes the
  same `SYSTEM_TEXT_FIELDS`, so the fonts, hero overlay/divider, band dividers,
  watermark, page backgrounds, contact details and legal copy all reach prod —
  the customer does not re-tune them by hand. Two exceptions to warn about:
  `spotlight_items` (per-database ids — re-pick the trio in the prod CMS) and
  `Branch` locations (per-environment; re-enter in `/admin/branches`).
- **Three things the brief cannot do**, so hand them to the operator as to-dos
  when you finish: pick the Spotlight's three items, add the physical branches,
  and upload real images (the seed uses the placeholder pool, and both a
  re-publish and the CMS preserve whatever they upload).
- Do not create Django models/endpoints or edit the frontend here. Content only.
  If the composition itself needs to change to show this content well, that is a
  `/new-site` task — but check first whether a **brief field** does it (a hard
  hero/band seam, a default-Roboto page and an unreadable hero over a photo are
  all settings, not code).
- Slugs are auto host-namespaced by the command; never hand-write global slugs.
