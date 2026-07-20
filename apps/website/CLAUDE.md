# website - App-Specific Conventions

## Auth - shared via `@repo/auth`

The auth stack lives in **`@repo/auth`** and is shared with `cinelog` and
`edge-folio`. Read `packages/auth/CLAUDE.md` first - it documents the session model
and the invariants. Only the website-specific parts are listed here.

JWTs live in HTTP-only `access_token` / `refresh_token` cookies and are **invisible
to JavaScript**. There is no `getAccessToken()`, no `Authorization` header built in
the browser, and no user in `localStorage`.

- **Identity is server-derived.** `getSession()` decodes the access cookie during the
  request; the root layout passes it to `<SessionProvider>`; client components read
  `useSession()`. `isAdmin` and `systemId` are **claims on the token**, so the admin
  nav renders correctly in the first HTML. They only drive presentation - Django
  re-derives both from the token on every call, and `proxy.ts` guards `/admin` and
  `/account`.
- **Browser → Django always goes through a Route Handler.** Client code calls
  same-origin `/api/auth/*` (see `lib/auth.ts`); the handler attaches the bearer
  token from the cookie. Handlers that talk to Django must use `apiFetch` from
  `@/lib/api-fetch` (a re-export of `@repo/auth/api-fetch`), which refreshes an
  expired access token and retries once.
- **The admin CMS proxies through `/api/admin/[...path]`.** `lib/admin-api.ts`
  rewrites `/api/x` → `/api/admin/x`; the catch-all forwards to Django via
  `apiFetch` behind a prefix allowlist. Adding a new admin endpoint under a new
  top-level prefix means adding that prefix to `ALLOWED_PREFIXES`.
- **`system_id` is resolved server-side, never sent by the client.** Login, signup,
  password-reset and passkey-authenticate handlers inject it from `getSystemId()`
  (request host → `getSystem()`), so a browser cannot choose its tenant. This is the
  one place website diverges from the other two frontends.
- **`API_URL` is server-only.** It used to be `NEXT_PUBLIC_API_URL`, which shipped the
  API host to the browser and baked it in at build time. Every consumer is a server
  component or route handler, so it is now a runtime, server-only variable
  (`passThroughEnv` in `turbo.json`, plain `env` in `helm/values.yaml`).
- **AI/LLM calls belong to the backend.** The admin CMS posts to `/api/ai/chat`,
  which is a thin `apiFetch` pass-through to website-api's `/api/ai/chat/`; that
  endpoint owns provider choice (Groq, falling back to OpenRouter) and holds the
  keys. There is no `GROQ_API_KEY` in this app any more, and no provider picker in
  the UI. The route streams Django's SSE body straight through - never buffer it
  (e.g. via `res.json()`), or the live preview turns into one lump at the end.

Passwords: the policy and its live checklist come from `@repo/auth/password-policy`
and `@repo/auth/password-requirements`; the `PasswordPolicy` messages are shared via
`@repo/i18n`. Server-only rules (the common-password list) surface via
`mapPasswordErrors`. Never add `validators=[validate_password]` in `website-api` -
use `run_password_validators`.

## Checkout - the Stripe keys are not in this app

Cart checkout posts to `/api/auth/checkout`, a thin `apiFetch` pass-through to
website-api's `/api/orders/checkout/`, which returns a hosted Stripe Checkout URL
to redirect to. **The same split as the LLM calls, for the same reason**: this app
is multi-tenant, each `System` connects its own Stripe account, and those keys
live encrypted in Django. There is no `stripe` dependency here and no
`STRIPE_SECRET_KEY` - never add one.

Unlike `video-downloader/components/credits-page.tsx` (the reference for this
flow), which builds the Stripe session in a Next route from one global env key,
nothing here may touch a Stripe credential.

- **A signed-in request body carries only a locale.** Items, quantities, prices
  and currency are read from the customer's cart rows server-side. A guest's
  body also carries their cart, but only as **references** (`{kind, id,
variant_id?, customization?, quantity}`) - Django re-prices every one of them
  from the catalog before creating a session. Either way: a client that could
  name a price could name its own.
- **`/orders/[id]` is the confirmation page and the permanent record.** The
  `session_id` Stripe appends is not proof of payment - only the signed webhook
  marks an order paid. `order-status-banner.tsx` refreshes for a few seconds when
  it lands on a still-`pending` order, then says "confirming", never "failed".
- **`getOrder` is not `cache()`d** across requests - a cached `pending` would
  outlive the webhook it is waiting for. `getOrders` (the history list) is.
- **The cart button's disabled state is decided server-side** (`stripe_configured`
  from `getSystem()`, plus `totals.length > 1` for a mixed-currency cart) so it
  renders right in the first HTML. Django re-checks both; this only drives what
  the customer sees.
- **In the admin CMS, a blank Stripe secret field means "leave unchanged".** The
  API never returns those keys, so the inputs always load blank - submitting `""`
  would wipe a tenant's credentials the first time anyone edited the slogan.
  `admin/system/page.tsx` deletes empty secret keys from the payload; keep that if
  you touch the form.

## Anonymous cart, favorites and guest checkout

**A visitor needs no account to save items, fill a cart, or pay.** The cart and
hearts live in `localStorage` (`lib/guest-cart.ts`), and are folded into the
account on sign-in.

- **The browser stores _references_, never prices.** `{kind, id, variant_id?,
customization?, quantity}` and nothing else. Everything displayable comes back
  from `POST /api/guest/resolve` (→ website-api's public `/api/guest/resolve/`,
  host-scoped), which prices the refs from the catalog and returns the **same
  `Cart` payload** a signed-in cart renders. Never cache a price locally: the
  same refs are re-priced at checkout, so a stored total could only disagree
  with what is charged.
- **A guest line's handle is its index in `localStorage`**, echoed back as the
  line's `id` - the stand-in for a `CartItem` row id, which is what lets one
  `CartLine` component serve both carts. `resolve_guest_cart` sets it from the
  index in the list it was **sent**, not the list it returns, because dead refs
  are dropped; an output position would address the wrong local line.
- **Read guest state only through `useGuestState()`** (`useSyncExternalStore`
  over the store). Its server snapshot is empty, so a guest's cart appears one
  frame after hydration - that gap is unavoidable and only affects logged-out
  visitors. Don't reintroduce a `useEffect` + `setState` read; the repo's
  react-hooks rules reject it.
- **Merging is `<GuestMerge />` in the root layout**, not a hook in the login
  form - password, passkey, sign-up and "already had a cookie" all have to merge.
  It POSTs to `/api/auth/guest/merge` (union; quantities summed, capped at 99)
  and only clears localStorage on a confirmed 200.
- **`/cart`, `/favorites` and `/orders/[id]` are _not_ in `proxy.ts`'s
  `protectedPrefixes`.** A guest order has no owner and its unguessable
  `public_id` is its only handle. The `/orders` **history list** is still
  signed-in only and guards itself in `page.tsx` - a path prefix can't tell it
  apart from a public order underneath it.
- **`getOrder` passes `allowAnonymous: true` + `X-Website-Host`.** With no token
  there is no profile to take the tenant from, so Django falls back to the host.
  An _owned_ order stays 404 to anyone but its owner.

## Per-Customer Sites (domain-driven frontend)

This app is **one Next.js app, many customer sites**. Each customer gets a
`sites/<slug>/` folder tied to one customer and one (or more) domain(s),
resolved by request host at runtime (`lib/resolve-site.ts` → `sites/registry.ts`).
`app/[locale]/page.tsx` dispatches the landing page to the resolved site;
`app/[locale]/[...sitePath]/page.tsx` serves a site's optional extra pages.
Unmatched hosts fall back to `sites/_default` (the generic DB-driven template).

**We code the frontend; the customer only self-edits the brand kit + content via
the backend CMS.** To build a customer site, use the **`/new-site`** skill. The
authoritative recipe (site contract, host→site→tenant chain, block library,
registration, styling rules, checklist) is **`sites/CLAUDE.md`**; the strategy
and rationale live in `apps/prds/website-sites.md`.

**Interaction language.** The site skills (`/new-site`, `/seed-site`, and
`/site-design` when entered directly) each begin by asking the operator whether
to conduct the session in **English or Spanish**, then run all interaction —
questions, the seed interview, summaries, hand-offs — in that language. It's the
conversation language only; it doesn't change the code or the site's own content
language (the bilingual `en_*` seed fields are decided separately in
`/seed-site`).

## Logo watermark & page background

The tenant's logo can be tiled faintly behind every **public** page
(`components/logo-watermark.tsx`, rendered by the locale layout inside
`<HideOnAdmin>` when `System.watermark_enabled`). The tenant tunes rotation,
size, spacing and opacity - plus the light/dark page background - in the CMS's
"Watermark & Background" section (`admin/system/watermark-section.tsx`), whose
preview renders the **same** component so it cannot drift from the site.

Two things to keep if you touch it:

- **Each logo is its own grid cell, not one repeating background.**
  `background-size` on a raster image sets the drawn size _and_ the repeat
  period, so there is no CSS way to leave a gap between copies. The cell is
  `size + spacing`, the logo is drawn `size` wide inside it, and `MAX_TILES`
  caps how many cells a tiny tile can produce.
- **Both page backgrounds ship as CSS variables, never as one resolved color.**
  The layout sets `--page-background-light` / `--page-background-dark` on
  `<body>` and `globals.css` picks one per `[data-theme]`. An inline
  `background` would be whatever the server resolved and would go stale the
  moment the visitor toggles the theme.

## Shared utility classes in `app/globals.css`

| Class                   | Use for                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `.section-title`        | `<h2>` (or any heading) that titles a page section                                                            |
| `.section-subtitle`     | Supporting paragraph beneath a section title                                                                  |
| `.highlights-header`    | Wrapper for a section-title (+ optional subtitle); flex-column + gap, resets the children's bottom margins    |
| `.zoom-on-hover`        | Card container with `overflow: hidden` - scales inner `<img>` to 1.1× on hover                                |
| `.card-content`         | Inner content wrapper of any card - standard padding (`16px` vertical, `10px` horizontal)                     |
| `.elevation-<1-24>`     | Box shadow matching `Box elevation={n}` - use on any element (Link, div, etc.) to apply the same shadow scale |
| `.item-price`           | Large, bold price display for product/service detail pages                                                    |
| `.item-compare-price`   | Muted, line-through compare price for detail pages                                                            |
| `.item-stock-in`        | Green "In Stock" indicator text                                                                               |
| `.item-stock-out`       | Red "Out of Stock" indicator text                                                                             |
| `.item-specs-table`     | Full-width spec/detail table with alternating borders and label column                                        |
| `.item-section-heading` | `<h2>` section heading inside a detail page (description, specs, etc.)                                        |

```tsx
<Typography as="h2" variant="h2" className="section-title">{title}</Typography>
<Typography variant="none" className="section-subtitle">{subtitle}</Typography>
```

When adding a new shared utility class to `globals.css`, update this table so the catalogue stays current.

## Page Header Spacing - Breadcrumbs + Title as a Tight Group

Every page follows the same vertical rhythm at the top: the **breadcrumbs and the
page `<h1>` read as one tight group**, with a small gap above the group (from the
navbar/hero) and a small gap between the breadcrumbs and the title. Don't reintroduce
the large gaps this convention exists to remove.

The spacing lives in exactly two places, so a new page gets it for free:

1. **The `Breadcrumbs` component owns the gap _below_ itself.** `breadcrumbs.css`
   (`@repo/ui/core-elements/breadcrumbs`) has `padding: 0; margin-bottom: 8px`. That
   8px is the single source of the breadcrumbs → title gap.
2. **The page `Container` owns the gap _above_ the group** via `marginTop={16}`.

**When you build a new page, follow this exact shape:**

```tsx
<Container
  paddingX={10}
  marginTop={16} /* + paddingTop navbar-height when there is no hero */
>
  <Breadcrumbs items={breadcrumbs} />
  {/* No marginTop on the h1 - the breadcrumbs' margin-bottom is the group gap */}
  <Typography as="h1" variant="h1" marginBottom={32}>
    {title}
  </Typography>
  ...
</Container>
```

Rules:

- **Never add `marginTop` to the `<h1>` that follows breadcrumbs.** The breadcrumbs'
  `margin-bottom` already provides the group gap; a title `marginTop` double-spaces it.
- **Use `marginTop={16}` on the page `Container`** (not the old `32`) for the space
  above the group. Admin pages inherit this from `admin/layout.tsx`'s Container, so
  admin route files add breadcrumbs with no wrapper margin of their own.
- The title's `marginBottom` (the gap from the group to the page content) is
  independent - keep whatever the page needs (commonly `32`, or `8` on detail pages).
- **When the first block after breadcrumbs is a _section wrapper_ (not an `<h1>`),
  cancel that wrapper's top padding so it doesn't reintroduce a large gap.** The
  breadcrumbs' 8px margin-bottom is still the only group gap. Concretely: the catalog
  listing pages (`categories/{products,services}`) add `catalog-section--flush-top`
  to the **first** rendered `.catalog-section` (its `padding: 48px 0 56px` rhythm is
  meant for _stacked_ sections, not the one directly under the breadcrumbs), and
  `components/category-detail.tsx` renders its root `<Box>` with no `paddingTop` for
  the same reason. Don't restore those top paddings.

## Shared Constants - Don't Duplicate Across Sibling Files

Before defining a constant, type, or pure utility function in a component file, check whether it already exists in a shared file in the same directory. If the same value appears (or is about to appear) in two or more sibling files, extract it into a dedicated shared module in their common parent directory.

**Current shared files to check first:**

| File                                                 | Contents                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/website/components/admin/paragraph-options.ts` | `PARAGRAPH_WORD_COUNTS`, `PARAGRAPH_LENGTH_STEPS`, `PARAGRAPH_COUNT_STEPS` - used by `admin-form.tsx` and `ai-interviewer/ai-interviewer.tsx` |

**How to apply:**

1. Before writing a new constant in any file under `apps/website/components/admin/`, grep for it across sibling files first.
2. If it already exists in a shared file, import it. If it exists in a sibling but not yet extracted, move it to the appropriate shared file and update both importers.
3. When creating a new shared file, name it after what it contains (`paragraph-options.ts`, `field-utils.ts`, etc.) - not after a consumer (`admin-form-helpers.ts`).

## Production env & secrets (k8s)

`helm/values.yaml` sets `envFromSecretBundle: website-secrets`, so **every key in
the `website-secrets` Secret becomes an env var** in the pod - add a key there and
it reaches the app with no chart change. The Secret is keyed by real env var names
(`TAVILY_API_KEY`, not `tavily-api-key`); the kubelet silently ignores keys that
aren't valid env var names, so never use kebab-case here.

Precedence, highest first:

1. `env:` in `helm/values.yaml` (e.g. `API_URL`) - **`env` beats `envFrom`**, so a
   value named here wins over the Secret's copy.
2. `website-secrets` via the bundle.
3. `.env.production` baked into the image - Next.js checks `process.env` **first**
   and stops at the first hit ([load order](https://nextjs.org/docs/app/guides/environment-variables#environment-variable-load-order)),
   so anything from k8s shadows this file.

⚠ **`.env.production` ships inside the image.** The root `.dockerignore` re-includes
it (`!**/.env.production`), `next build` copies it into `.next/standalone`, and the
Dockerfile copies standalone into the runtime image - so any key in it is readable
by anyone who can pull the image. It is now redundant for anything in
`website-secrets`; prefer the Secret and keep credentials out of that file.

Update the Secret with **`pnpm secrets`** (`cli/setup-k8s-secrets/`), which reads
`env.example`, derives the name `website-secrets` from the app folder, and patches
only the keys you tick. Two cautions: it offers `env.example`'s dev values as
defaults and Enter accepts them (type real values), and its "Restart pods?" prompt
restarts every workload in the namespace - `postgres` and `redis` included - so
prefer `kubectl rollout restart deployment/website -n website`. Keep comments in
`env.example` _below_ the keys: the script reads any comment as the section heading
for everything that follows.

`GROQ_API_KEY` in `website-secrets` is **obsolete** - LLM calls moved to
website-api. It can be dropped once nothing else reads it (`pnpm secrets` cannot
delete keys; that needs a manual `kubectl patch` with a null value).
