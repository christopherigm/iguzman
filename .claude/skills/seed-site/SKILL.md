---
name: seed-site
description: Populate a customer site's INITIAL CONTENT (the backend data the landing page renders) after /new-site has scaffolded the frontend. Runs a business-strategist discovery interview - challenging the operator's assumptions one question at a time until the concept is sharp - then writes a JSON brief and runs the website-api `seed_site` command to create the System copy + success stories + highlights + product/service catalog, with placeholder images and YouTube/links from seed_assets/. Use when the user asks to populate/seed a new site, fill in landing content, or "make the landing look complete" for a customer in the website app (e.g. "/seed-site acme.com").
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

## Read these FIRST — the contract you fill

- **`apps/website-api/seed_assets/README.md`** — the brief JSON schema, the
  placeholder image pool, `links.json`, and how `seed_site` maps a brief to
  records. **This is the source of truth for field names; do not invent fields.**
- **`apps/website-api/seed_assets/brief.example.json`** — a complete filled
  brief. Copy its shape.
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
   - **Catalog** — the real products/services, sensible categories, and
     **realistic prices + currency** (CFO: challenge margins/price points that
     don't add up).
   - **Voice & brand** — tone, primary/secondary colors, bilingual? (fill `en_*`
     mirror fields if the site serves English + Spanish).
   - **Assets** — do they have a hero video (YouTube), logo, real photos? If not,
     confirm you'll use the `seed_assets/` placeholder pool and they swap later.
4. **Know when to stop.** When you can state the positioning in one sentence, name
   the ICP, list 3 quantified proof points, and 4–6 highlights and a real
   catalog — **stop interviewing and summarize the concept back** in a short brief
   for the operator to confirm before you build.

Keep it efficient: a good interview is ~6–12 sharp exchanges, not 40 timid ones.

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

- **This seeds the *local* DB only.** Once the operator has verified the site
  locally, publishing it to production is a separate step: `pnpm publish-site
  <host>` serializes this content out of the local DB and upserts it into the prod
  Django (placeholder images skipped — the customer uploads real ones via the
  CMS). See `apps/website/sites/CLAUDE.md` → "Publishing to production". Not part
  of this skill; just point the operator to it when the seed looks good.
- If the operator later drops real images into `seed_assets/`, point the relevant
  brief `image` fields at them and re-run with `--reset` — no code change.
- Do not create Django models/endpoints or edit the frontend here. Content only.
- Slugs are auto host-namespaced by the command; never hand-write global slugs.
