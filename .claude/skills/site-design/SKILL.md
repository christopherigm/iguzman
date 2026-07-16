---
name: site-design
description: The design playbook for building EXCEPTIONAL, non-generic customer landing pages in apps/website (the sites/<slug>/ folders). Read this before composing or restyling any landing/section/page - it defines the visual quality bar, the anti-"AI-generated-look" rules (no purple/violet defaults, no translateY hover lifts, no gradient soup), the core-element purity rule (never restyle @repo/ui - build a site-local component instead), a craft rubric, and layout archetypes per business type. Use when creating a site with /new-site, when a landing "looks generic/AI-made", or when asked to improve a site's visuals.
---

# site-design — make a customer site look designed, not generated

This is the **craft** companion to `apps/website/sites/CLAUDE.md` (the structural
recipe). CLAUDE.md tells you _where code goes and how tenancy resolves_; this
skill tells you _how to make the result look genuinely good_ — bespoke, calm,
and free of the tells that mark a page as machine-generated.

> **The whole point of in-house design:** every customer site should look like a
> studio hand-built it for that one business. A page that could be any business,
> or that screams "an AI made this," is a failure even if it compiles and passes
> lint.

If anything here conflicts with `sites/CLAUDE.md` or the repo styling rules,
**those win** — this skill never overrides the props-first rule or the tenancy
contract.

---

## 1. Core-element purity — never restyle `@repo/ui`, extend it in the site

The single most common way these sites go wrong: reaching for `<Button unstyled>`
plus a pile of custom padding / `borderRadius` / `elevation` / hover CSS to force
a look. The result is inconsistent, off-theme, and usually ugly (the pre-refactor
bdrone CTAs were the poster child).

**Rules, in order:**

1. **Use the core element with its own props first.** `@repo/ui` buttons already
   have `kind` (`primary`/`success`/`error`/`warning`), `size` (`sm`/`md`/`lg`),
   a tasteful hover shadow, and a wave. The layout drives `--accent` from the
   tenant's `System.primary_color`, so **`<Button kind="primary" size="lg" />`
   is already the customer's brand color** — you never pass a color.

   ```tsx
   // ✓ brand-colored primary CTA, zero custom styling
   <Button text={t("hero.book")} href="/services" kind="primary" size="lg" />
   // ✓ neutral secondary CTA
   <Button text={t("hero.browse")} href="/products" size="lg" />
   // ✓ tertiary / low-emphasis link
   <LinkButton label={t("hero.learn")} href="/about" />
   ```

2. **Never edit files under `packages/ui/src/core-elements/` to change how one
   site looks.** Those are shared by every app. A per-site need is never a reason
   to touch shared code.

3. **If you genuinely need a variant the core element doesn't offer** (e.g. a
   true outline/ghost CTA, a pill tag with an icon, a stat tile), **build a small
   component inside the site folder** — `sites/<slug>/components/<name>.tsx` — and
   use it there. Compose it from core elements + the `styles` escape hatch; keep
   it props-first internally. It lives and dies with that one site.

   ```tsx
   // sites/acme/components/outline-cta.tsx — a site-local special button
   import { Button, type ButtonProps } from "@repo/ui/core-elements/button";

   export function OutlineCta(props: ButtonProps) {
     return (
       <Button
         {...props}
         unstyled
         color="var(--accent)"
         border="2px solid var(--accent)"
         padding="10px 20px"
         borderRadius={10}
         className="acme-outline-cta" // hover/transition only, per the styling rule
       />
     );
   }
   ```

   If such a component proves reusable across sites, promote it to
   `apps/website/components/` (same rule as sections).

**Litmus test:** if you typed `unstyled` on a core `<Button>` inside a
`landing.tsx`/`sections/`/`pages/` file, stop — either a `kind`/`size` prop does
it, or it belongs in a named site-local component.

---

## 2. Anti-"AI look" rules — the tells to avoid

These are the patterns that make a page read as auto-generated. Treat each as a
hard **don't** unless the customer's brand specifically calls for it.

| Tell (don't)                                                                                                                                                 | Do instead                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purple / violet / indigo / magenta** as the default accent or in gradients (the #1 giveaway). The old bdrone `#e040fb` magenta secondary was exactly this. | Drive color from the tenant's real brand (`System.primary_color` → already the theme `--accent`). If a brand _is_ purple, fine — but never _default_ to purple.                                                      |
| **`transform: translateY(-Npx)` lift on hover**, `scale(1.05)` bounce, springy card hops.                                                                    | Signal interactivity with **color, shadow (`elevation`), or opacity** transitions — the core Button/Card already do this well. Keep motion subtle and ≤200ms.                                                        |
| **Gradient soup** — diagonal multi-stop brand gradients behind every band, glowing blobs, `linear-gradient(135deg, …)` everywhere.                           | Create section rhythm with a **solid neutral band** (`backgroundColor="var(--surface-2)"`) behind alternate sections. Reserve any gradient for a single deliberate moment (e.g. a hero overlay), never as wallpaper. |
| **Glassmorphism everywhere** — `backdrop-filter: blur()` on every card.                                                                                      | Flat surfaces + real borders (`--border`) and elevation. Blur is opt-in and rare.                                                                                                                                    |
| **Neon glows / heavy `box-shadow` in accent color.**                                                                                                         | Neutral elevation shadows (the `elevation` prop scale).                                                                                                                                                              |
| **Emoji used as UI icons** (🚀 ✨ 🎯 in headings/buttons).                                                                                                   | The `Icon` component with real SVG paths, or no icon.                                                                                                                                                                |
| **The generic hero:** centered headline + subhead + two pill buttons floating over a gradient blob, identical for every business.                            | A hero grounded in the customer's actual offer and imagery; vary composition (split, full-bleed photo, left-aligned) by business type — see §4.                                                                      |
| **Everything is a uniform 3-up card grid.**                                                                                                                  | Vary section shape: a split feature, a wide media band, a list, a single testimonial — not five identical grids stacked.                                                                                             |
| **Faux copy / faux stats** ("Trusted by 10,000+ users", lorem).                                                                                              | Copy and numbers come from the DB (the customer's real content via `/seed-site` + CMS). Never hardcode marketing claims.                                                                                             |
| **Rounded-everything at huge radii** (`borderRadius: 24`+ on every box) or **hairline 1px everything**.                                                      | A consistent, moderate radius scale (cards ~10–12, media ~16–20) applied with intent.                                                                                                                                |

Quick self-audit before finishing — grep your diff for the mechanical tells:

```bash
grep -rn "translateY\|scale(1\.\|135deg\|#.*fb\b\|blur(\|🚀\|✨\|🎯" sites/<slug>/
```

Any hit needs a justification or a fix.

---

## 3. The craft rubric — what "well-designed" means here

Score a landing against these. A site should clear all six.

1. **Hierarchy.** One clear focal point per viewport. Exactly one `h1` (the
   hero). Section titles are `h2`; don't compete with the hero. Use the
   `Typography` `variant` scale — never hand-set `fontSize` to fake hierarchy.
2. **Type discipline.** Body copy is `variant="body"` (never the removed
   `body-sm`); `caption` only for genuine metadata. Weight and size come from the
   variant; you adjust `fontWeight` and `color`, not `fontSize`.
3. **Color restraint.** One brand accent (`--accent`, tenant-driven) + the
   neutral tokens (`--foreground`, `--background`, `--surface-2`, `--border`,
   `--muted-foreground`). That's the palette. Accent is for _emphasis_ (primary
   CTA, active state, a single highlight), not for filling large areas.
4. **Spacing rhythm.** Pick one vertical section-padding value and reuse it
   (e.g. `paddingY={64}` on section wrappers, `{48}` on mobile via responsive
   props). Inconsistent gaps read as sloppy. Group related items tight, separate
   sections generously.
5. **Deliberate section order & variety.** The order should tell the customer's
   story (see archetypes), and adjacent sections should differ in shape and
   background so the eye has rhythm. Alternate plain / `--surface-2` bands.
6. **Responsive, theme-aware, accessible.** No horizontal body scroll at any
   width; verify light _and_ dark; every image has real `alt`; headings nest
   correctly; interactive targets are ≥40px.

---

## 4. Layout archetypes — start from the business type

Don't stack the default block order. Choose the archetype closest to the
customer and compose from the block library (`@/components/*`) + site-local
`sections/`. These are starting points — adapt to the actual offer.

- **Services / agency / B2B** (bdrone, consultancies): Hero → **Intro** (who we
  are, split with one image, primary + secondary CTA) → **Highlights** (why us /
  capabilities, on a `--surface-2` band) → **Service categories** → featured
  **Service items** → **Success stories** (proof) → contact CTA.
- **Restaurant / hospitality / local venue:** Hero (full-bleed food photo, name +
  one line + "View menu") → short **Intro** (the story, warm and brief) →
  **Menu/Category** tiles → **Highlights** (hours, location, ambiance) →
  **Success stories** (reviews). Imagery-led; minimal text.
- **Product / e-commerce / catalog:** Hero (product-forward) → **Featured
  products** (the star, not buried) → **Categories** (shop by) → **Highlights**
  (shipping/guarantee/quality) → **Success stories**. Lead with product, not prose.
- **Portfolio / studio / creator:** Hero (bold type, one signature image) →
  **Highlights** (selected work as a varied grid) → **Intro** (about/approach) →
  **Success stories** → contact. Let whitespace and imagery carry it.
- **Single-service local** (clinic, gym, salon): Hero (offer + book CTA) →
  **Intro** (trust: credentials, why) → **Service items** (what you book) →
  **Highlights** (results/amenities) → **Success stories** → prominent booking CTA.

Whatever the type: **hide sections the customer has no data for** (zero products
⇒ no product nav/section), and never invent content to fill a template.

---

## 5. Working method

1. **Read the brief for business type + tone**, pick the archetype (§4).
2. **Compose from the block library first** (they're tenant-aware and cached);
   only build a `sections/` component for something with no shared equivalent.
3. **Style props-first**; use core elements with `kind`/`size`; a special variant
   becomes a site-local `components/` file (§1) — never restyled shared code.
4. **Apply the rubric** (§3) and **scrub for tells** (§2, run the grep).
5. **Verify by eye** in `pnpm dev` via the dev site switcher, in **both light and
   dark**, at mobile and desktop widths. Confirm no horizontal scroll and that the
   primary CTA is the tenant's brand color.

The reference exemplar in-repo is **`sites/bdrone/`** (post-refactor): core
`Button`/`LinkButton` CTAs, neutral `--surface-2` bands for rhythm, no purple, no
`translateY`. Mirror its restraint.
