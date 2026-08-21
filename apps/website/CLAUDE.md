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
  endpoint owns provider choice (OpenRouter) and holds the key. There is no LLM API
  key in this app any more, and no provider picker in the UI. The route streams Django's SSE body straight through - never buffer it
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
customization?, quantity}`) - Django re-prices every one of them
  from the catalog before creating a session. Either way: a client that could
  name a price could name its own.
- **A signed-out visitor whose order turns out to be owned is sent to `/auth`,
  not to a 404.** A guest order is readable by whoever holds its link, so the
  only way an anonymous request gets nothing back is that the order *has* an
  owner - which is now the ordinary outcome of checking out as a guest on an
  address this site already has an account for (website-api's CLAUDE.md →
  "Payments"). A receipt leading to "this order does not exist" is the one thing
  it is not. The redirect carries `?next=/orders/<id>`, which
  `(auth)/auth/auth-form-with-next.tsx` validates as a same-site path (a leading
  `/` that is not `//`) before handing it to `AuthForm`'s `resolveRedirect` -
  unvalidated, the sign-in form would be an open redirect on the tenant's own
  domain. ⚠ A **signed-in** reader keeps the 404: "not yours" and "not there"
  are the same answer by then, and offering them a login form they are past
  would be a loop.
- **`/orders/[id]` is the confirmation page and the permanent record.** The
  `session_id` Stripe appends is not proof of payment - only the signed webhook
  marks an order paid. `order-status-banner.tsx` refreshes for a few seconds when
  it lands on a still-`pending` order, then says "confirming", never "failed".
- **`getOrder` is not `cache()`d** across requests - a cached `pending` would
  outlive the webhook it is waiting for. `getOrders` (the history list) is.
- **`complete-payment-button.tsx` sends a customer back to Stripe for an order
  they left unpaid**, via `/api/orders/[id]/pay` (another `allowAnonymous` +
  `X-Website-Host` pass-through, since a guest order has no owner). `page.tsx`
  renders it only for a `pending` **online** order **and only when there is no
  `session_id` in the URL** - a customer who has just returned from paying is
  watching the banner wait on the webhook, and offering to charge them again
  there would be alarming and wrong. A plain reload brings it back if the webhook
  genuinely never lands. Every refusal is a real server-side state change (sold
  out, slot taken, payment landed), so the handler calls `router.refresh()` as
  well as showing the message - the banner above it is stale too.
- **The cart button's disabled state is decided server-side** (`stripe_configured`
  from `getSystem()`, plus `totals.length > 1` for a mixed-currency cart) so it
  renders right in the first HTML. Django re-checks both; this only drives what
  the customer sees.
- **In the admin CMS, a blank Stripe secret field means "leave unchanged".** The
  API never returns those keys, so the inputs always load blank - submitting `""`
  would wipe a tenant's credentials the first time anyone toggled a switch.
  The whole Stripe connection (plus the two offline payment methods) lives on
  **`admin/payments/`** - its own CMS page, not `/admin/system` - and
  `admin/payments/page.tsx` deletes empty secret keys from the payload; keep that
  if you touch the form.
- **`/orders/[id]` is also where the order's QR code leads, and an admin may
  open it for any of their tenant's orders.** The code (rendered in the summary
  card, and embedded in the confirmation email) encodes this page, not
  `/admin/orders/<public_id>` - a QR carries one URL and it is printed on a
  receipt the customer keeps, so it has to work for whoever holds it. An admin
  who scans one lands here and takes the **See in admin** button below "Back to
  orders" through to the CMS. That button is gated on `session.isAdmin`, a claim
  on the access token, so it renders in the first HTML - presentation only, since
  `proxy.ts` guards `/admin` and Django re-derives the claim on every call. The
  API side of this (`_may_read` vs `_may_pay`) is in website-api's CLAUDE.md →
  "Order QR codes"; ⚠ `order.qr_code` is **null on any order placed before the
  field existed**, so the block is conditional and must stay that way.

### Re-ordering a whole past order

`/orders/[id]` carries an **Order everything again** button in its summary card
(`reorder-button.tsx`), above "Back to orders": the whole receipt back into the
basket and on to `/cart`. The per-line "Buy again" / "Book again" badges stay -
this is the whole-order shortcut beside them, not a replacement. The API owns
every rule; read website-api's CLAUDE.md → "Re-ordering a past order" first.

- ⚠ **Nothing here decides what goes in.** The button sends only the order's id;
  `POST /api/orders/<id>/reorder/` walks the order's own frozen lines, drops what
  can no longer be bought and rebuilds the rest - the chosen size and the
  ingredient edits included, from ids the line snapshotted. It is the same rule
  the cart follows for a coupon and for a price: a client that could name a line
  could name one the customer never bought.
- **It is gated on `line.item_reorderable`**, which is the API's own answer to
  the question the endpoint asks - deliberately _not_ re-derived here from
  `item_id` + `item_booking_enabled`, which is a near-miss (it misses stock and
  availability) and the miss is a button offering what the endpoint then refuses.
  A booking's single service line is false, so an appointment carries no button.
- ⚠ **An order placed before the ids existed re-orders as the dish is listed**,
  with no warning - a name cannot be turned back into an ingredient row, and
  guessing from a string the tenant may since have reused would put a different
  dish in the basket than the one on the receipt above it.
- **It adds to the cart, never replaces it**, and a guest gets it too: the API
  hands back the references and `addGuestCartLine` writes them, exactly as it
  writes every other line a logged-out visitor adds. That branch is the only
  thing `isLoggedIn` decides - a signed-in cart was already written server-side
  by the time the response arrived.
- **A refusal calls `router.refresh()` as well as printing a message**, the same
  rule `complete-payment-button.tsx` follows: every reason it can be refused is a
  real change on the catalog's side, so the lines' own badges are stale too.

## Contact by WhatsApp - deep links, not the Cloud API

A customer leaves an **email or a WhatsApp number** (or both) on the contact
form, and an admin answers from `/admin/messages/[id]` on either channel. The
WhatsApp half is **click-to-chat only**: `lib/contact.ts`'s `whatsappHref` builds
a `wa.me` URL and the admin's own WhatsApp sends the message. There is no Meta
Cloud API, no WABA, no webhook and no provider credential anywhere in the stack.

- ⚠ **A recorded WhatsApp reply is an intent, not a delivery.** The email path
  writes `replied_at` only after the mail actually went out, so the "Replied"
  badge never lies. The WhatsApp path cannot make that promise - the message
  leaves through an app this code cannot see - so
  `POST /api/contact-messages/admin/<pk>/reply/` with `channel: "whatsapp"`
  **records without sending**, and every surface that shows it says so
  (`whatsappRecordedNote`). Don't collapse the two paths into one "send" button;
  the asymmetry is the honest part.
- **That is also why the CMS hands off in two steps** - "Open in WhatsApp" (a
  plain link) and then "Mark as replied" (the recording call). One button cannot
  do both anyway: `@repo/ui`'s `Button` renders a `<Link>` wrapper when given an
  `href` and **drops `onClick` entirely**, and an async `window.open` after the
  recording round-trip is what popup blockers exist to stop.
- **`ContactMessage.email` is optional now.** Anything reading it must treat it
  as possibly blank - the notification email's `reply_to` especially, where an
  empty entry is a malformed header. The API refuses a message carrying neither
  address, which is the only thing that keeps every message answerable.
- **`preferred_channel` is what the customer asked for; `reply_channel` is what
  an admin used.** They are separate because they genuinely disagree - a customer
  may leave both addresses and be answered on the other one. Neither is ever
  stored pointing at an address that is not there: the create view falls back to
  whichever one exists, and the shared `ContactForm` asks the question the other
  way round - its two channel buttons **swap** the email field for the WhatsApp
  one, so the chosen channel's address is the required field and cannot be
  missing. (Both addresses are still submitted when a sender filled both before
  switching, which is why the API-side fallback stays.)
- **The form is embedded on a detail page by one component**,
  `components/contact/item-question-card.tsx` (`ItemQuestionCard`), used by all
  three catalog families - product, service and menu item. It takes
  `{kind, id, name}` (the name already resolved for the locale by the page) and
  renders its own grid cell, so it drops into any of the three detail grids.
  It replaced a `*DetailQuestion` copy in `product-detail.tsx` and
  `menu-detail.tsx` that had already started to describe itself differently;
  don't add a fourth per-module copy for a new surface. The WhatsApp choice
  comes with it for free - `ContactFormClient` always passes `collectPhone`, so
  a detail page asks the channel question exactly as `/contact` does.
- **The upgrade path is inbound-first, not outbound-first.** If this ever becomes
  a real Cloud API integration, the piece to build is the **webhook** that turns
  an inbound WhatsApp message into a `ContactMessage` - not a send call. Meta's
  24-hour customer service window only opens on a message _from_ the customer, so
  a reply to a web-form submission would be template-gated and the free-text box
  in the CMS would be unusable. Per-tenant credentials would follow the Stripe
  pattern (Fernet on `System`, blank-means-unchanged in the CMS) and the webhook
  the `stripe_webhook_token` pattern.

## Booking - a service sold as an appointment

A service with `booking_enabled` swaps its cart CTAs for a fulfillment picker
plus **Book now** (`components/service-booking-cta.tsx`), which leads to
`/booking/<slug>` - a centred `Card` with the location select, a month calendar,
the day's free times, a details box and the payment choice. The API side owns
every rule; read `website-api/CLAUDE.md` → "Bookings" first.

- **The cart CTAs are replaced, not joined.** A service sold as an appointment
  occupies a specific hour at a specific place, which a cart line has no way to
  hold - keeping "Add to cart" alongside would let a customer buy a haircut with
  no time attached to it.
- **Nothing in the frontend decides availability.** Every date and every time on
  screen came from `/api/booking/availability`, which runs the same engine
  checkout re-runs before writing. The form's job is to show that answer, not to
  have an opinion about opening hours. A `SLOT_UNAVAILABLE` on submit drops the
  selection and refetches rather than telling the customer to retry the same dead
  slot. **Today's slots decay while the page is open**, so `booking-form.tsx`
  re-asks every 60 seconds (skipped while the tab is hidden, and again on the way
  back into view) - a refetch, deliberately, rather than a client-side "drop the
  ones that have passed" filter, which would be this component forming exactly
  the opinion the rule above forbids.
- ⚠ **Never format a booking instant with a bare `toLocaleString()`.** The
  helpers in `lib/booking-shared.ts` all take the booking's own `timeZone` and
  none of them fall back to the browser's: an appointment happens at the
  _branch's_ local time, and a customer reading their order from another country
  must be shown the hour they are expected to arrive. `localDateKey` exists for
  the same reason - `toISOString()` would give the UTC date, filing an 8pm Mexico
  City slot under tomorrow.
- **`lib/booking-shared.ts` is the client-safe half**, split from `lib/booking.ts`
  exactly as `orders-shared.ts` is split from `orders.ts` - a `"use client"`
  component importing a runtime value from the fetcher module would drag
  `next/headers` into its bundle and fail the build.
- **One route handler for guests and signed-in customers** (`/api/booking/checkout`),
  unlike cart checkout's `/api/auth/checkout` + `/api/guest/checkout` pair. Those
  are split because a guest's cart travels in the body while a signed-in cart is
  read from rows; a booking body is identical either way, so this uses
  `allowAnonymous` plus `X-Website-Host` - token first, host as the fallback,
  like `getOrder`.
- **The location choice rides in search params**, so it survives a refresh, a
  shared link and the back button. The booking page re-validates it against what
  the service actually offers - the params are in a URL the customer can edit.
- **An empty `booking_branches` means every branch**, not none. Both the detail
  page and the booking page filter with that rule; getting it backwards makes an
  unconfigured bookable service look broken.
- **The calendar is hand-rolled** (`components/booking/booking-calendar.tsx`)
  because the one thing a native `<input type="date">` cannot do is grey out the
  days with no slots, which is the entire reason to show a calendar. Its day
  cells are the one place here with a CSS file: every rule in it is a `:hover` /
  `:disabled` / transition state a prop cannot express.
- **In the CMS**, `/admin/bookings` lists upcoming appointments with
  confirm/complete/cancel, and the booking block on a service is
  `components/admin/service-booking-section.tsx`. A branch's schedule editor is
  `components/admin/branch-hours-editor.tsx`, submitted with the rest of the
  branch form as one `hours` array - **a day switched off is a row that is not
  sent**, matching the API's "no row = closed".
- **A past service line is re-ordered as a booking, not as a cart line.**
  `order-line-row.tsx` swaps "Buy again" for **Book again** (→ `/booking/<slug>`)
  whenever the line's service is `item_booking_enabled`, for the same reason the
  detail page swaps its cart CTAs: an appointment needs an hour and a place a
  cart line cannot hold. ⚠ The flag is read **live** through the FK on the API
  side, like `item_slug` - it addresses the site as it is now, so a service the
  tenant has since closed to booking goes back to "Buy again" rather than
  linking to a page that 404s.
- Booking status has its **own** colour scale on the order card and the CMS list,
  deliberately not the order-status one: a confirmed booking wearing the paid
  order's green would read as "the money arrived", which it does not say.

### Party size (a booking that covers several people)

A service with `booking_party_enabled` is priced **per person**, and one booking
covers a whole party. The API owns every rule; read website-api's CLAUDE.md →
"Party size and resource pools" first.

- **The counter appears twice**, and neither is decorative: on the service detail
  page (`components/service-booking-cta.tsx`, beside "Book now") where it seeds
  the choice, and above the calendar on `/booking/<slug>` where it decides which
  days and times may be shown at all. Putting the booking-page one _below_ the
  calendar would let a customer pick a slot and watch it vanish.
- **`party` rides in the search params**, exactly like `fulfillment` and
  `branch`, and the booking page re-validates it - the params are in a URL the
  customer can edit. It also joins `requestKey`, so changing it refetches and the
  derived-selection pattern drops a now-impossible slot for free.
- ⚠ **`booking_party_limit` is an upper bound, not a promise.** The API computes
  it as `min(what the service allows, what the biggest single resource holds)`
  across every location, so it ignores who is already booked and can differ per
  branch. Use it as the counter's static ceiling - never as "this party will
  definitely fit". The availability payload is what actually answers that.
- ⚠ **`booking_party_enabled` must be on `FeaturedService` in `lib/catalog.ts`,
  not only on `ServiceDetail`.** The catalog card renders from the **list**
  payload, and a field present only on the detail type means the "per person"
  label silently never appears. It is deliberately the only party field on the
  list type - the bounds and the ceiling cost the API a walk over pools and
  resources per service.
- **`seats_left` is the largest free block on one resource, not the sum**, so a
  slot showing "3 places left" genuinely cannot take a party of four. The slot
  buttons only print it where seats are actually scarce - on a one-person
  appointment every slot has one seat and saying so on all of them says nothing.
- **The resource picker ("Any boat" / Panga / Marlin) only renders when the
  payload carries `resources`**, which happens only for a `customer_selectable`
  pool. That is the exception: a salon assigns whichever chair is free and the
  customer never hears about it.
- **`components/quantity-stepper.tsx` is the shared `− n +` control**, extracted
  from `menu-ingredient-picker.tsx` when the party counter became its second
  consumer. Fully controlled and owns no state: both consumers need the number
  elsewhere (the booking page's search params, the availability request key), and
  a stepper holding its own copy would be a second source of truth. ⚠ **The two
  booking counters are all that is left of it** - a menu ingredient is counted by
  `PortionGauge` + `PortionSlider` now (see "Customising a dish"), which draw
  _how much_ lands on the dish; a party of four is just four and has nothing to
  draw. Don't re-unify them.
- **A branch's resources are edited in
  `components/admin/resource-pools-editor.tsx`**, on the branch form beside the
  hours. ⚠ Unlike the hours it is **not** replace-all: each row carries its `id`
  and the API upserts, because `Booking.resource` points at these rows and a
  delete-and-recreate would strip the assigned boat off every appointment on any
  save of that form - including one that only changed the phone number.
- **`/admin/bookings` can reassign a party**, with two separate buttons: **Move**
  re-validates through the availability engine and refuses a resource that cannot
  take the party, **Overbook** confirms first and forces it. Keeping them apart is
  the point - the safe action must not quietly become the unsafe one because a
  seat count was tight.

## Events - dated, informational, and never a booking

An `Event` is a dated happening a tenant announces (a tasting, a workshop, a live
set): editorial content in the same family as a success story, with a date and a
place. **Purely informational by design** - nothing registers, reserves or pays.
A service sold as an appointment is `booking_enabled` on a `Service`, which is a
different feature with a different model; adding attendance here later means a
second model hanging off `Event` (the shape `orders.Booking` uses against
`Order`), not extra columns on it.

| Piece                   | Where                                           |
| ----------------------- | ----------------------------------------------- |
| The landing band        | `components/events.tsx` (+ its slider and card) |
| The archive / one event | `app/[locale]/events/`, `.../events/[slug]/`    |
| Fetchers                | `lib/events.ts`                                 |
| Formatting, client-safe | `lib/event-shared.ts`                           |
| The CMS                 | `app/[locale]/admin/events/`                    |
| Model, API, cache       | website-api `core/` (`Event`, `EventImage`)     |

Six things that will bite:

- ⚠ **Never decide "is this over?" in the frontend.** `event.is_past` comes from
  the API, which resolves it against the event's **own** timezone and, for an
  all-day event, against the end of its local day. An all-day event is stored at
  midnight, so `new Date(starts_at) < Date.now()` retires it one minute into the
  day it is happening on - the one day it must be on the site.
- ⚠ **Never format an event instant with a bare `toLocaleString()`.** Every
  helper in `lib/event-shared.ts` takes the event's `timeZone` and none falls
  back to the browser's - the same rule the booking helpers follow, and for the
  same reason: a reader in another country must be shown the hour they are
  expected to arrive.
- ⚠ **The CMS form's date inputs are wall clock, not instants.** A
  `datetime-local` value carries no zone, and `new Date()` resolves it in the
  **browser's** - so an operator abroad would file every event at the wrong hour.
  `wallClockToInstant` / `instantToWallClock` convert against the event's own
  `timezone`; the `datetime` `FieldDef` type exists for exactly this and its
  docstring says so.
- **The location is resolved on the API side, and the CMS edits the raw
  columns.** `venue_name`/`address`/`latitude`/`longitude` on the payload have
  already fallen back to the event's `branch` (`Event.effective_*`); the row's
  own values travel as `own_*`. Public pages read the resolved pair, the form
  reads `own_*` - loading the resolved ones into the form would show the branch's
  address in the address box, an author would "correct" it, and the event would
  silently detach from the location carrying its coordinates.
- **`Event` has no `sort_order`, deliberately** - unlike every sibling content
  model. It is ordered by when it happens, and a hand-dragged order beside a date
  is a second source of truth that can only disagree with the first. That is why
  `/admin/events` is the one entity list with no drag-to-reorder mode.
- **`event_count` includes past events**, and the navbar link is gated on it.
  Counting only the upcoming ones would take the link away the day after the last
  event and strand `/events` and every shared event link. Like every derived
  count on `SystemSerializer` it needs a signal clearing the System payload on
  write - `core/signals.py` has one; the payload is cached for an hour.

## The menu - one sectioning, one listing, one detail route

A menu is sectioned by the tenant's own `MenuCategory` rows and by nothing else,
and `MenuItem.category` is **required**. Everything follows from that:

| Surface                    | Path                      | File                                           |
| -------------------------- | ------------------------- | ---------------------------------------------- |
| The whole menu             | `/categories/menu`        | `components/menu-listing.tsx`                  |
| One category               | `/categories/menu/<slug>` | `app/[locale]/categories/menu/[slug]/page.tsx` |
| One item                   | `/menu/<category>/<slug>` | `components/menu-item-detail-page.tsx`         |
| One item, stable permalink | `/menu/<slug>`            | `app/[locale]/menu/[category]/page.tsx`        |
| Paths                      | —                         | `lib/menu-paths.ts`                            |

This replaced a `MenuItem.kind` enum (food/drink/dessert/side/appetizer) that sat
beside the category and drove five listing pages
(`/categories/{food,drinks,desserts,sides,appetizers}`), five detail routes
(`/food/<slug>` and siblings), a `?kind=` filter and ten `System` label columns.
The API side is in website-api's CLAUDE.md → "Menu sectioning".

- ⚠ **Never build a menu path by concatenation.** `MENU_ALL_PATH`,
  `menuCategoryHref(slug)` and `menuItemHref(categorySlug, slug)` in
  `lib/menu-paths.ts` are the only three. That module is deliberately plain data
  with no server import: the navbar is a **client** component and needs it, while
  `lib/catalog.ts` reaches `next/headers` through `resolve-site.ts`. It also
  carries **`MENU_ICON`** - the one glyph every "go to the menu" button wears
  (the landing heroes' CTA, "See more menu items", "Browse food", and the phone
  index's own pill), beside the path all of them point at.
- ⚠ **An item's URL moves when an operator re-files the dish.** The slug alone
  is globally unique, so the category segment addresses nothing extra - it is
  there because the URL is meant to read that way. `/menu/<slug>` is the
  category-independent permalink that resolves and `permanentRedirect`s to the
  current URL; hand _that_ out for anything printed. `next.config.js` redirects
  all ten pre-category paths (and `/categories/food/<slug>`) permanently.
- ⚠ **Both menu routes live under `app/[locale]/menu/[category]/`** - the
  permalink is that folder's own `page.tsx` and the detail page is `[slug]/`
  inside it. The two _URLs_ don't collide (Next matches on segment count), but
  the _folders_ would: giving one dynamic level two different slug names
  (`menu/[slug]` beside `menu/[category]/…`) makes Next refuse to start with
  "You cannot use different slug names for the same dynamic path". So the
  permalink page reads its item slug out of the `category` param, and says so.
- **The detail route serves an item only under its own category**; anything else
  is `notFound()`. One item, one URL - and a 404 is also how a re-filed item
  surfaces on its old address, rather than rendering under a URL that
  misdescribes it.
- **The navbar's Menu dropdown is one entry per category**, resolved in
  `[locale]/layout.tsx` (the navbar is a client component, and category names are
  per-locale tenant copy) and filtered to `item_count > 0` so an empty category is
  never a dead link. With a single category the dropdown collapses to a plain
  link. It costs one `getMenuCategories()` read, which is `cache()`d per request
  and cached in Django - it is **content**, so it is not on the System payload
  beside the flat `menu_item_count`.
- **`/categories/menu` groups items by category in the categories' own CMS
  order** (`sort_order`), driven by the `categories` list rather than by grouping
  the items - so the operator's arrangement is what the page reads as. A category
  with no items gets its card but no section: an empty grid under a heading reads
  as a broken page.
- **The item sections sit beside a category rail** (`components/menu-category-nav.tsx`),
  because a menu with a few hundred dishes is otherwise navigable only by
  scrolling - the category cards at the top are an index right up until they
  leave the screen. It is `position: sticky` under the fixed navbar, **not** a
  hand-positioned `fixed` box: sticky gives both halves of the behaviour (in-line
  beside the first grid, pinned from there on) and stops travelling when its grid
  column ends, so the rail cannot outlive the sections it addresses. Its cell
  carries `hidden={{ xs: true, sm: true }}`, so it is `md`-and-up only and no
  media query decides that - below `md` the index is the floating control in the
  next bullet. Clicking an entry goes through `scrollToElement` (never a bare
  `scrollIntoView`) at the section heading's own `id`; the heading carries the
  `scroll-margin-top` that clears the navbar.
  ⚠ **That call passes `revealNavbar: true`, and so does the category card's
  (`scroll-to-section-link.tsx`)** - the two jumps into this page. Below `sm`
  the navbar hides on the way down, and a jump into a section _is_ a downward
  scroll, so a reader who pressed an entry arrived at their dishes with the bar
  swiped away; the option tells `@repo/ui`'s `Navbar` the scroll was the app's,
  which leaves the bar alone during the travel and shows it when the page
  lands. It is the same jump on both indexes, so both must pass it or the phone
  card and the rail come to behave differently. The two `block: "nearest"`
  scrolls in this app (the portion picker, the CMS list editors) deliberately
  do **not**: they nudge the page by a few pixels inside a control the reader
  is already using, where a bar sliding in is noise rather than a rescue. The rail claims 3 of 12 columns
  from `md`, which is why the item cards go three-across there (`md: 4`).
  ⚠ **It starts level with the first item _card_, and the way it does that is a
  spacer that _is_ the section heading** - the same `Box` + `Typography` markup
  carrying one non-breaking space, below `.catalog-section`'s own 48px top
  padding. A hard-coded offset would be wrong the moment the heading's type or
  rhythm changed; this moves both columns together. ⚠ **That spacer lives
  _inside_ the sticky `nav`, and the 48px padding lives outside it** - which is
  what keeps the two columns level in the _pinned_ state too, not just the
  in-flow one. The sticky `top` is `navbar + 16px`, i.e. exactly the
  `scroll-margin-top` the section headings carry, so the box comes to rest with
  its first child - the heading replica - sitting where the jumped-to section's
  own heading is, and the card's top edge therefore lands on that section's first
  item card. (The 48px stays outside because a jump parks the heading at the
  navbar and leaves the section's top padding above the viewport; carried inside,
  the pinned rail would sit 48px low.) It **ends** level with the last item card
  for the mirror-image reason: the rail's cell is as tall as the sections column,
  which runs 56px past that card, so the rail carries a 56px bottom margin - a
  sticky box is constrained to its containing block _minus its margins_, and
  without it the rail's last resting position sat that far below the grid it
  addresses. Those two numbers (48 / 56) are the only ones copied from
  `catalog-categories.css` - keep them in step.
- **Below `md` the index is a floating button, not a shrunken rail**
  (`components/menu-category-nav-mobile.tsx`): a pill floating just above the
  bottom edge - the site-wide menu glyph and "See Menu" (`FoodPage.navButton`,
  deliberately not the page's own "Menu" heading: a button labelled with the
  name of the page it is on says nothing) - which raises a card of the same
  entries out of itself. On a phone there is no
  column to give a rail, and a full-width bar of category names would cost more
  of the screen than the dishes it exists to reach, so the list is on screen only
  while it is being used. ⚠ **The two controls are one feature split at one
  breakpoint**: the rail's cell is `hidden={{ xs: true, sm: true }}` and this one
  is taken out from `md` up by the single `@media (--md)` in its CSS - move one
  without the other and the page has two indexes or none. It is a media query
  here (and a prop there) only because a self-positioned control belongs to no
  grid cell. **The entries are the rail's own `MenuCategoryNavItems`** at
  `size="lg"` for a thumb, plus `align="center"` (a free-floating panel hanging
  off the middle of a pill, where the rail's ranged-left column would read as
  offset) - the same one-prop difference POS makes to the ingredient picker - so
  a jump behaves identically on both and the card closes itself on the way,
  being over the content just asked for.
  ⚠ **It is `position: sticky`, not `fixed`, and the card is lifted out of its
  flow** to make that possible. Sticky with a `bottom` offset floats the pill
  for as long as its own flow position is below the fold and settles into that
  position when the page scrolls down to it - and its flow position is the end
  of the menu, after the last item grid and above the footer, so the control
  parks under the dishes instead of covering the page's last row for good.
  `fixed` can only ever be one of those two. The **button alone** is what sits
  in flow (the card is `position: absolute`, hung off `bottom: 100%`): in flow
  the card is ~360px tall and a parked control reserving that much would open a
  hole above the footer.
  ⚠ **While it floats it is backed by a halo** - a radial gradient of
  `--page-background` (78% in the middle, nothing at the edge), centred on the
  pill, as wide as the screen and much shallower than it is wide, so its lower
  half falls off the bottom edge and what is drawn is the top half of a broad
  flat oval. It is `100vw`, not `100%`: the control sits inside the page
  `Container`, whose padding would leave the halo narrower than the content it
  is clearing - safe only because `globals.css` puts `overflow-x: hidden` on
  `html`, and because a box centred on a centred control can only reach both
  viewport edges at once. Over a grid of dish photographs a
  pill of one flat colour has nothing to sit against; the halo is the page
  clearing a space for it. It is painted **only** in the floating state, and a
  stuck sticky box is not a state CSS can select on - so the component measures
  one (`rect.bottom` against `innerHeight − ` the resolved `bottom` offset, one
  rAF per scroll frame) and sets `--floating`. Parked, the pill is already on
  that exact colour and the halo would be a smudge around it rather than a
  clearing behind it. ⚠ The offset is **read** off `getComputedStyle`, never
  restated: it is a `calc()` over `--ui-fab-offset` and the safe-area inset.
  ⚠ Its **chevron points up while the card is closed**
  and turns over to point down when the card is up - the arrow says where the
  card will go next, not where it is; the glyph is `chevron-down.svg` drawn
  rotated, so the closed state is the one carrying the `rotate(180deg)`.
  ⚠ Every state of the card's `transform` keeps its centring
  `translateX(-50%)`, the reduced-motion one included - drop it and the card
  lands half its own width to the right.
  **Its card wears the same cradled brandmark the rail's does**, and on the same
  `hero_text_frame` gate - the arch is a piece of the frame's design language,
  where the button's own glyph is not (that one is tenant-independent). Both draw the
  rail's `MenuNavCradle`, which is exported from `menu-category-nav.tsx` so the
  arch's three tuning numbers live in one place. ⚠ **`menu-listing.tsx` renders
  it and passes it down as a node**, because this control is a client component
  and `@repo/ui/hero` pulls `react-player` into the browser bundle at module
  scope - the same reason `menu-category-nav-items.tsx` is split out. It hangs
  off the wrapper around the `Card`, not the `Card`, whose `overflow: auto`
  would clip the disc away.
  ⚠ **The card is never unmounted**: it is folded down into the button with
  `visibility`/`opacity`/`transform`, so it animates in _and_ out, and
  `visibility` is what takes the entries out of the tab order while they are
  invisible. ⚠ **The container takes `pointer-events: none` and its two children
  take them back** - it still covers the closed card's footprint, and a
  transparent box swallows taps exactly as an opaque one does. Dismissal is an
  outside press or `Escape`, deliberately with **no scrim**: this is a jump list,
  not a dialog. **The button wears `MENU_ICON`, not the tenant's
  `img_brandmark`** - the same glyph every "go to the menu" CTA on the site
  carries (the landing heroes' menu button, "See more menu items", "Browse
  food"), so the control reads as one of them. A site's own mark says which site
  you are on, not what the button does; the cradle on the card's edge is where
  the brand still speaks, and that one _is_ gated on `hero_text_frame`. Both controls read their accent and foreground
  from `menu-category-nav-colors.ts`, which is plain data importing nothing so
  that the client control and the server rail can share it.
  ⚠ **That foreground is a literal white, not `var(--accent-foreground)`.**
  The two variables come apart on this site: `[locale]/layout.tsx` overrides
  `--accent` with the tenant's brand colour (one hex, both themes) but leaves
  `--accent-foreground` alone, and `PaletteProvider` writes the palette's own
  value onto `document.body` on every theme change - white against the light
  palette's accent, near-black against the _lighter_ accent each dark variant
  ships. A customer whose brand colour is dark therefore got near-black text on
  it in dark mode, across the pill, the card and the rail, which are the accent
  edge to edge. Light mode already resolved to white on all three, so pinning it
  only stops dark mode disagreeing. The real fix is to publish the foreground
  wherever the accent is overridden (`contrastText`, as the layout already does
  for `--secondary`) - and it belongs in `@repo/ui`, since `PaletteProvider`
  would otherwise overwrite it on the next theme toggle.
- **One entry is lit at a time - the section the reader is in** - filled with the
  tenant's **secondary** colour, whether they got there by pressing it or by
  scrolling to it. It lives in the shared `MenuCategoryNavItems`, so the rail and
  the phone card cannot come to disagree about where the reader is.
  ⚠ **The line the scroll spy measures against is each heading's own
  `scroll-margin-top`**, read off `getComputedStyle` rather than restated - that
  is the offset a jump parks the heading at, so "the heading crossed the line"
  and "the entry I pressed has arrived" are one event decided by one number, and
  the navbar's height moves both together. The lit entry is the **last** heading
  at or above that line, plus one special case: at the foot of the document the
  **last** entry wins, since a short final section can never bring its own
  heading up to the line. ⚠ **A press lights its entry immediately and holds it
  until the travel lands** (`SETTLE_MS` is a ceiling, released early the moment
  the target arrives) - without the hold, a smooth scroll past four sections runs
  the highlight down the list like a slot machine.
- **`--secondary` / `--secondary-foreground` are published by
  `[locale]/layout.tsx`**, beside `--accent`, from `System.secondary_color` -
  so a component can reach for the second brand colour without a prop threaded
  down from whichever page holds the System. The foreground is picked
  server-side with `contrastText` (now `lib/colors.ts`, re-exported from the
  social templates' `types.ts` for its nine importers): CSS has no contrast
  function, and the tenant's hex can be light or dark. ⚠ Both are left **unset**
  for a tenant with no secondary colour rather than falling back to the accent -
  on a card already painted in the accent that is no highlight at all, so the
  consumer's own fallback (a tint of the card's text) has to answer instead.
- **The rail wears the tenant's cradled brandmark**, on the same "Framed
  heading" switch (`hero_text_frame` + `img_brandmark`) that frames a hero
  heading and cradles the footer's edge - the shared `BrandmarkCradle`, so the
  three brand moments cannot drift. It hangs off the box wrapping the `Card`,
  **not** the `Card` itself: the card scrolls its own overflow for a tenant with
  more categories than fit the viewport, and `overflow: auto` would clip the disc
  away. (Not off the `nav` either, any more - the `nav`'s top edge is the
  spacer's, a whole heading above the card.) The arches and the area they
  enclose are painted in the rail's own `--accent`, so the swell reads as the
  card rising to meet the mark; the card's top edge does not move, because the
  cradle is absolutely positioned and hangs up into the lead spacer.
  ⚠ **No straight flanks here** (`flanks={false}`): they are the parent's top
  border, and this parent is a `Card` with rounded top corners, so the square
  rules left a stub of accent hanging past each curve. ⚠ **The arch is taller
  and wider than the default** (`2.8 × 1.3` badges, against `2.1 × 0.7`): the
  pinned card sits a whole section heading below the navbar and the disc is
  carried by the shoulders, so at the stock height the mark came to rest that far
  down the screen. The height is bounded at both ends - pinned the crest must
  clear the navbar, in flow it must stay inside the spacer - and the width has to
  grow with it or the shoulders read as a peak instead of a swell. ⚠ **And the
  arch _closes over_ the mark here** (`enclose={0.14}`), which the hero's and the
  footer's do not: on an arch this tall a mark perched on the crest reads as
  small and stranded, so it is set into it with a ring of accent all round, like
  a medallion in a niche. Raising that number sinks the mark further rather than
  lifting it - the ring's top is the crest. **There is no printed
  rail title** - `title` names it for a screen reader only; a heading over a
  column of category names said what the column says, and it was the one thing
  between the cradled mark and the list.
- ⚠ **`menu-category-nav.tsx` is a _server_ component and its buttons are a
  separate `"use client"` file** (`menu-category-nav-items.tsx`). The split is
  the cradle: `@repo/ui/hero` imports `HeroVideo` at module scope and the
  package is not marked side-effect-free, so importing `BrandmarkCradle` from a
  client module drags `react-player` into this page's browser bundle for one
  `<svg>`. Don't merge them back.
- **A category _card_ on `/categories/menu` scrolls to its section** rather than
  leading to `/categories/menu/<slug>`, since the dishes are further down the
  same page - `components/scroll-to-section-link.tsx`, wrapping the card the
  page already renders. ⚠ It listens on the **capture** phase: the card is a
  `Link`, which `preventDefault`s and pushes the route in its own `onClick`, so
  a bubbling handler above it would fire after the navigation had started. The
  href stays on the card - it is the category's real address, it is what an
  empty category (a card with no section) still needs, and a ⌘/middle click
  still opens it in a new tab.
- ⚠ **In the CMS, Category is a required field on the menu-item form and is
  deliberately excluded from the "blank → null" list** in `handleSubmit`. A blank
  must reach the API and be refused, not be nulled into a row the storefront
  cannot address.
- ⚠ **Deleting a menu category deletes every dish in it** (CASCADE on a required
  FK). Far more destructive than deleting a product category, whose items merely
  lose their FK.

## The three catalog CMS lists are grouped by category

`/admin/products`, `/admin/services` and `/admin/menu-items` render one
collapsible table **per category** instead of one list with every record in it,
through `AdminEntityList`'s `grouping` prop. The sections follow the categories'
own CMS order, and the trailing "Uncategorized" one holds whatever has no
category. Nothing else in the CMS is grouped - it is the three lists a tenant
actually fills in the hundreds.

- **The pages fetch their category list for its _order_.** Grouping off the rows
  alone can only sort the sections by whichever item happens to come first, which
  is not the arrangement the storefront reads in. The heading is the category's
  `name` (the primary-language one), exactly as the category `<select>` on the
  item form labels its options - the CMS does not localise tenant copy.
- **It only takes effect once the rows fall into more than one section.** A
  catalog whose records all share a category has nothing to group, so it stays
  the plain single table it was, with no header to collapse.
- **A category with no items gets no section**, the same rule the storefront's
  menu sections follow - an empty table under a heading reads as a broken page.
  A row pointing at a category the list did not carry falls in with the
  uncategorized ones, so a record can never drop off the page.
- ⚠ **Sort mode is per section, and leaving it normalises `sort_order`.**
  Turning the switch on re-seeds the drag draft with the **flattened section
  order**, so what is dragged is what is stored, and a drop outside the dragged
  row's own section is refused (its category decides which section it is in, so
  such a drop could only snap back). The trade is that switching sort on and off
  can write rows nobody dragged - it is what keeps the stored order, and so the
  storefront's flat listings, in the arrangement the CMS shows.
- **Sections start expanded and the collapsed ones are the state that is kept**,
  so a category added while the page is open is open too.

## Bulk actions - finishing a catalog without opening two hundred forms

Every content CMS list carries a **bulk-action bar** between its header row
(title / sort / + New) and its table: three passes that fill in what a tenant
left blank across the **whole list at once**. A catalog arrives written in one
language, with no photographs and no points, and the alternative to these is
opening every record in turn.

| Piece                    | Where                                                                |
| ------------------------ | -------------------------------------------------------------------- |
| The bar, and the run     | `components/admin/bulk-actions.tsx` (`BulkActionsBar`)               |
| Turning it on for a list | `AdminEntityList`'s `bulkActions` prop                               |
| The give-back pair       | `components/admin/points-give-back.tsx` (shared with the calculator) |

| Action                       | What it writes                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Translate missing fields** | The missing half of each `x` / `en_x` pair, from the half that is there, through the same `/api/ai` proxy and the same `buildTranslateMessages` prompts a single field's Translate button uses. |
| **Main image**               | The first photo a free stock bank returns for the record's own name, with the credit that bank is owed.                                                                                         |
| **Rewards**                  | `points_award` + `points_price`, from each item's own price and one give-back the operator states once.                                                                                         |

- ⚠ **The fields are configured per list, never inferred from the rows.** A read
  serializer carries pairs no write serializer accepts - an event's
  `en_venue_name` is _derived_ from its branch, and the writable field is
  `own_en_venue_name` - so a pass that paired keys by their `en_` prefix would
  write into a field that does not exist and lose the operator the row. Each
  page names its own `translate: [...]` keys, and only keys its write serializer
  takes.
- **`replace` is a switch in the confirmation, and it is off.** Off, a run only
  fills blanks and is safe to repeat; on, it overwrites what an operator typed by
  hand and the dialog says so in `--error`. ⚠ With it **on**, the _Spanish_ half
  is the translation source - a filled pair cannot be asked which half is the
  original. The ordinary run has no such problem: it reads whichever half is
  actually there, so a catalog authored in English translates the other way.
- ⚠ **A run is resumable, not transactional.** Each row is written with the
  list's ordinary `PATCH` as it is worked out, so a stop, a failure or a closed
  tab leaves the finished rows saved and the rest untouched - and running it
  again picks up where it stopped, because every action skips what is already
  filled in. There is no undo, which is what the confirmation is for.
- **The rows are walked one at a time, deliberately.** A translate pass is one
  LLM call per field and a photo pass one bank search per row; firing two hundred
  of either at once is how a tenant's key gets rate-limited half way through a
  catalog. It is also what makes the count honest - `2/32` is two rows
  **written**, not two requests in flight - and what lets Stop actually stop.
- **The bar is hidden in sort mode.** The rows are being dragged, and a pass that
  re-read the list underneath a drag would throw the arrangement away before it
  was saved.
- **Brands are the one content list with no bar**: a brand has no `en_name` to
  fill and its picture is a `logo`, not a photograph a stock bank could stand in
  for. Branches get **Translate only**, for the same reason - their image field
  is a `map_image`.
- ⚠ **The photo and its credit go in one write** (`stockImageFields`), the same
  rule the CMS picker follows - see "Finding an image in the CMS" below.
- **Rewards is offered only where there is a price to work from.** The three
  buyable lists carry it; the categories do not, even though they have their own
  `points_award`, because a category has no price and the award would have to be
  invented rather than derived.

## A detail form's buttons are there before its record is

**Every button in a CMS form's header and in its fixed action bar renders from
the first paint, disabled while the record loads - never hidden and then
revealed.** A form used to be replaced wholesale by a "Loading..." line, so the
bar arrived a fetch later, under the cursor of an operator already reaching for
Save; the same reasoning the sibling arrows have always followed (below) now
covers the bar they sit in.

- **`AdminForm` takes `loading`**, which disables Save, Clone and the
  production-view button, shows the `ProgressBar` the way `saving` does, and
  marks the `<form>` `aria-busy`. The three pages that hand-roll their own bar
  (coupons, social posts, users) pass the same flag to the same buttons
  themselves.
- ⚠ **`productionHref` has three states, and `null` is the load-bearing one**:
  `undefined` is "no public page" (a new record, `/admin/system`), a string is
  the live address, and **`null` is "it has one, but the slug hasn't arrived
  yet"** - which renders the button disabled instead of dropping it. So a form
  writes `isNew ? undefined : values.slug ? href : null`, never
  `!isNew && values.slug ? href : undefined`, which is what made the button pop
  into the bar mid-load and shift Save sideways.
- ⚠ **While it is disabled the button is given no `href` at all.** `Button`'s
  link mode wraps a _type-less_ `<button>` in an anchor, so a disabled one is
  still keyboard-reachable, still navigates on Enter, and would submit the form
  on the way - the same trap the "same-tab navigation on purpose" comment beside
  it documents. With no `href` it is a plain `<button type="button">`.
- **The fields go inert with the buttons**, via a single `disabled` `<fieldset>`
  around the grid _and_ whatever editors a page passes as `children` - the one
  thing in HTML that disables a subtree, so no `disabled` prop has to be
  threaded through every field type and every sub-editor. It is what keeps the
  old guarantee that the early return gave for free: nothing typed into a
  default value is silently overwritten when the record lands. The action bar is
  deliberately outside it.
- **A failed load still replaces the form** (`/admin/users/[id]`'s `errorLoad`).
  That is an answer, not a wait - only the waiting renders the form.

## Stepping through a CMS list from a detail form

Every editable record's form flanks its Save button with a prev and a next
arrow, so a run of records - re-photographing forty dishes, say - is worked
through without going back to the table between each one.

| Piece                | Where                                 |
| -------------------- | ------------------------------------- |
| The two arrows       | `components/admin/sibling-arrows.tsx` |
| Which record is next | `hooks/use-admin-siblings.ts`         |
| The order itself     | `components/admin/entity-order.ts`    |

- ⚠ **The arrows walk the order the list _reads in_, not the order the API
  returns rows in.** For products, services and menu items those differ - the
  CMS groups them into one collapsible table per category - so the flattening
  was split out of `admin-entity-list.tsx` into `entity-order.ts` and both
  consumers share it. Those three forms are the only ones passing `groupKey` /
  `groupList`; re-deriving the sequence anywhere else is how "next" comes to
  mean something different from the row below.
- **An end of the list is a disabled `<button>`, not a link.** `IconButton`
  only renders a `Link` when it is given an `href`, so passing none is what
  makes the last record's next arrow inert - and its `type` defaults to
  `"button"`, so an arrow sitting inside `AdminForm`'s `<form>` never submits
  it, the same trap the "view in production" button documents.
- **Both arrows are disabled while the list loads**, rather than appearing once
  it lands: the bar would otherwise grow two buttons under the operator's
  cursor. A record the list does not carry gets the same treatment - there is no
  known neighbour, and saying so is better than guessing one.
- **A new record has no arrows at all.** `useAdminSiblings` returns `undefined`
  for `id === "new"`, and `AdminForm` renders nothing for an undefined
  `siblings` - which is also how a singleton form (system settings) opts out.
- **Navigating discards unsaved edits, deliberately unguarded** - the Back /
  Cancel button beside the title has always done the same, and a confirm on one
  and not the other would be the confusing half-measure.
- ⚠ **`groupKey`/`groupList` and `list` are effect deps**, so they must be the
  module-level `list*` functions from `lib/admin-api.ts`. An inline arrow would
  re-fetch the whole list on every render.
- **The hook fetches the list itself rather than reusing rows a page may already
  hold.** Two forms (menu items, users) therefore load the same list twice. That
  is the accepted cost of one wiring shape across fifteen forms, on admin pages
  whose reads are cached in Django.
- **Three forms hand-roll their own action bar** - coupons and social posts
  (their own fixed bars) and users (no fixed bar at all, so the arrows flank the
  Save in its header row). They draw `SiblingArrow` directly; only the twelve
  `AdminForm` forms get it from the `siblings` prop.

## Catalog kind labels - what a tenant calls its products and services

A workshop's "Services" are _Lo que hacemos_. `System` carries a bilingual label
pair (`kind_label_<kind>` / `en_kind_label_<kind>`) for each of the **two**
Buyable families, authored in the CMS at `/admin/system` → Catalog names
(`admin/system/kind-labels-section.tsx`). `lib/kind-labels.ts` resolves them;
`getKindLabels(locale)` in `lib/system.ts` is the server-side read (a thin,
`cache()`d view over the System payload the request already fetched).

- **A menu has no labels here**, because its sections are the tenant's own
  categories - see above. This used to cover seven kinds; the five menu ones went
  with `MenuItem.kind`, and `kindLabelWithOverride` (the CMS's "Food (Pizzas)"
  dropdown annotation) went with them.
- ⚠ **A label is a label. Nothing routes off one.** `/categories/products` and
  `/products/<slug>` are structural and must not move when a tenant renames a
  family - a customer's bookmark and a search result have to keep working. Never
  build a path from a label.
- **Blank means "use our translation".** `kindLabels()` drops empty overrides, so
  an un-renamed site renders exactly as it did before the feature existed and
  clearing both fields is how a rename is undone. English reads `en_*` and falls
  back to the Spanish copy; every other locale reads the Spanish copy and falls
  back to English - the same rule `metadata.ts` and the catalog cards follow, so
  a tenant who fills one language is renamed everywhere rather than on half the
  site.
- **Where the override applies**: the navbar's Products/Services links, each
  listing page's `<h1>`, hero slogan and tab title, and the family step of a
  product/service breadcrumb.
- **Composed sentences are left alone** - `CatalogItems`' "See more products",
  the listing pages' "All Products" / "Product Categories". Substituting a label
  into a translated sentence is not safe across five locales (French elides
  before a vowel, German puts the noun mid-clause), and the destination page the
  CTA leads to carries the tenant's own name anyway.
- **The navbar takes them as a prop.** It is a client component, so
  `[locale]/layout.tsx` resolves `kindLabels(system, locale)` from the System it
  already holds. `lib/kind-labels.ts` is plain data with no server import for the
  same reason `lib/menu-paths.ts` is - and that is why `KindLabelOverrides` is
  declared there and `System` extends it, rather than the reverse.

## Maps - one component, one basemap, one credit

Every map on this site is `components/place-map.tsx` (`PlaceMap`), a thin client
wrapper over `@repo/ui`'s **`OsmMap`**: OpenStreetMap-style raster tiles painted
into the page's own DOM, one pin, no Google iframe. Four surfaces draw one: each
location on the contact page (`components/contact/contact-locations.tsx`) - and
so, through the same component, each location in a landing's `FindUs` block
(`components/find-us.tsx`) - an event's venue
(`app/[locale]/events/[slug]/page.tsx`), the buy box of a bookable service
(`components/service-booking-cta.tsx`), and the branch a booking is being made at
(`booking-form.tsx`). It replaced the per-surface copies - an `EventMap`
component and an inline `OsmMap` on the contact page - which had already started
to drift.

**Which basemap they draw is one tenant setting**, authored in the CMS at
`/admin/system` → Maps (`admin/system/map-section.tsx`): `System.map_style` picks
between OSM's standard tiles, three CARTO styles and a `custom` tile URL, with
`map_tile_url` / `map_attribution` / `map_attribution_url` beside it.
`lib/basemap.ts` resolves the four columns once in `[locale]/layout.tsx` and
`BasemapProvider` publishes the result to the whole tree, so no map takes a prop
for it and no page hosting one has to fetch `getSystem()`.

Five things that will bite:

- ⚠ **The credit is not a translation, and `Contact.mapAttribution` is gone.**
  Every provider requires its own attribution string and it changes with the tile
  URL, so a CARTO basemap credited "© OpenStreetMap contributors" is
  under-credited - a licence problem, not a copy problem. An i18n key cannot
  follow a setting an operator edits at runtime, so the string comes off the
  resolved basemap (`@repo/ui/core-elements/basemaps`, which keeps each URL
  beside the credit it owes). The key was removed from all five locale files;
  don't reintroduce it.
- ⚠ **The credit's link is its own field, and blank means unlinked.** Most
  providers require the credit to point back at them; `OsmAttribution` used to
  anchor every credit to openstreetmap.org/copyright regardless, so a
  "© MapTiler" named one party and linked another. Absent, the credit is plain
  text - never restore a default href.
- ⚠ **This picks a style, not what the style shows.** These are raster tiles:
  roads, labels and building footprints are painted into each PNG before it
  arrives, so there is no "hide the houses" flag here and there cannot be one
  while the renderer is a raster one. The route to a real per-layer choice is
  `custom` pointed at a style authored in a provider's own editor with that
  layer deleted.
- ⚠ **A provider key pasted into `map_tile_url` is public**, and cannot be
  otherwise: tiles are fetched from the visitor's own browser and
  `GET /api/system/` is `AllowAny`. Restrict it by origin at the provider rather
  than treating the column as a secret.
- **The pin wears the tenant's `img_brandmark`, not its logo.** The pin's head
  is a 34 px circle that crops what it is given, so a wide wordmark comes out as
  three letters from its own middle. With no brandmark it is a plain accent
  teardrop, which is fine.
- **Both map controls are on by default** - a two-button row in the top-right
  corner (locate, then fullscreen; in fullscreen, locate then close), wearing
  `OsmMap`'s own default glyphs, all three of which `public/icons/` ships. Every
  surface here answers "where is this, relative to me?", which is why they are on
  the shared component rather than per-page. ⚠ **Locating is a _button_**: nothing
  asks for the geolocation permission until it is pressed, and a refusal, a
  device with no fix and an insecure origin are all the same path - no pin, no
  message, the map exactly as it was. Never write a branch that reports the
  failure. Fullscreen is a CSS overlay, not the Fullscreen API (`requestFullscreen`
  is still dead on iPhone Safari); `Escape` leaves it.

**Three booking surfaces draw the location, and all three gate it on `branch`
fulfillment.** With `on_premises` the tenant travels to the customer, so a map of
the shop would point at the wrong address on the very page where the right one is
typed. A location the tenant never pinned gets no map, exactly as on the contact
page.

- **The service detail page** draws it _inside_ `ServiceBookingCta`, directly
  under the Where/Location selects and above the party counter and "Book now".
  It is in the client component rather than beside the price in
  `ServiceDetailPanel` because it **follows the select**: with several locations
  it re-centres as the customer changes their pick, and with one it simply shows
  that one. That is also why `BookingCtaBranch` carries coordinates - the
  server component resolves them, the client one chooses between them.
- **The booking page** puts it at the top of the right-hand column, above "Your
  details" - the location has already been chosen on the left, and this is the
  last chance to notice it is the wrong side of town before typing a name and
  paying.
- **The order page** (`orders/[id]/booking-location.tsx`) puts it under the
  lines, with a **Directions** button. It reads
  `order.booking.branch_location`, which the API returns as `null` for an
  on-premises booking, an unpinned branch and a deleted one alike - so the gate
  above is enforced on the API side here rather than re-derived. It draws a
  **live** `PlaceMap`, not the stored screenshot: a web page can render a map,
  and a live one cannot go stale against a pin the tenant has since moved.

### Picking the pin, and the screenshot that comes off it

`components/admin/map-picker.tsx` is the CMS's coordinate control, on the branch
form (`admin/branches/[id]`), mounted through `AdminForm`'s `slots` ahead of the
booking group. It is ported from `apps/animals`' picker and shares its whole
surface with `PlaceMap` through `@repo/ui`'s `osm-map-chrome` + `mercator`, so
the map an operator pins on and the map a customer reads are one design.

- ⚠ **The branch form has no Latitude / Longitude inputs any more.** The picker
  writes both, and the pair is shown beneath it as a readout. Two decimal boxes
  beside a map are a second way to set one value - and the one that can end up
  disagreeing with the pin the screenshot was taken of. They are still ordinary
  keys in `values`, so the payload is unchanged.
- **It also takes `Branch.map_image`**, via `lib/map-capture.ts`: the tiles and
  the brandmark pin painted into a canvas and uploaded as base64 with the
  coordinates. That picture exists for the **confirmation email**, which cannot
  draw a live map and whose sender (website-api) must not be fetching map tiles
  per message - see that CLAUDE.md → "`Branch.map_image`".
- **Captured on save, and only when the pin moved** (or there is a pin and no
  stored picture). A save that only changed the phone number sends no
  `map_image` at all, which the API reads as "leave the stored one alone".
- ⚠ **Everything drawn into that canvas must be same-origin or CORS-clean**, or
  `toDataURL` throws on a tainted canvas. Tiles are fetched
  `crossOrigin="anonymous"` (OSM and CARTO both allow it); the brandmark goes
  through `/api/media` first (`lib/same-origin-image.ts`, shared with the
  flyer exports, which need it for the same reason). A tenant whose
  **custom** tile URL sends no CORS header simply gets no screenshot - the
  coordinates still save and the email still carries its Directions button.
- **The provider's credit is burned into the image.** A still leaves the site
  entirely and has nowhere else to put one; the live maps carry it as
  `OsmAttribution`.
- ⚠ **The captured pin is redrawn by hand to match `osm-map.css`** - a canvas has
  no CSS. Keep the two in step, and remember the pin's **tip**, not its centre,
  is the coordinate.

## A detail page's buy box - how many, then the two CTAs

The three catalog detail pages price the item, say how many of it to buy, and
offer the two ways to buy it - in that order, and in the same shape on all
three: **the quantity stepper sits on the "add to cart" row and "buy now" goes
underneath it.**

| Piece               | Where                                                |
| ------------------- | ---------------------------------------------------- |
| Product / service   | `components/item-buy-actions.tsx` (`ItemBuyActions`) |
| Menu item           | `components/menu-item-customizer.tsx`                |
| The `− n +` control | `components/quantity-stepper.tsx`                    |

- **The quantity belongs beside the button that acts on it.** A detail page used
  to have no way to say "three of these" at all - the count was chosen a screen
  later, on the cart page. Three controls do not read on one line, so the
  express path is what moved: "buy now" is one decision about a number already
  decided above it.
- ⚠ **Nothing here is measured, unlike the catalog card's row.**
  `buyable-card-actions.tsx` walks its controls down to a bare glyph because a
  card is as wide as whatever grid it landed in; a buy box is one grid cell at
  100% width in every breakpoint and every locale, so a labelled button and a
  stepper always fit. Don't port the density walk over here.
- **The stepper counts the _next_ add and nothing else.** It is not a live
  handle on a line that already exists, so it goes with the add state - once the
  item is in the cart the button flips to "remove" and the cart page's own
  stepper is the only thing that can change that line's quantity - and it
  returns to one after a successful add. Same rule, and the same shared
  `useInCart`, as the card.
- **"Buy now" carries the same count**, so a customer who asked for three and
  took the express path arrives at checkout with three. That is what
  `BuyNowButton`'s `quantity` is for; it defaults to 1, which is what the order
  page's "Buy again" badges still pass.
- **A food item's buy box is the customiser's**, not `ItemBuyActions` - its add
  carries a size and a selection, and `MenuItemCustomizer` already owns both.
  ⚠ Its stepper state is `orderQuantity`, deliberately not `quantity`: the
  customisation context it consumes exports a `setQuantity` of its own, for how
  much of an **ingredient** goes on the dish.

## Anonymous cart, favorites and guest checkout

**A visitor needs no account to save items, fill a cart, or pay.** The cart and
hearts live in `localStorage` (`lib/guest-cart.ts`), and are folded into the
account on sign-in.

- **The browser stores _references_, never prices.** `{kind, id, customization?,
quantity}` and nothing else. Everything displayable comes back
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

## The cart's "don't forget these" strip

Under the cart lines - inside their column, not across the page - sits a strip of
extras the tenant has said go with what is in the basket. The API owns every
rule; read website-api's CLAUDE.md → "Checkout recommendations" first.

| Piece                     | Where                                         |
| ------------------------- | --------------------------------------------- |
| Signed-in (server)        | `app/[locale]/cart/cart-recommendations.tsx`  |
| Guest (client)            | `app/[locale]/cart/guest-recommendations.tsx` |
| The shared heading + grid | `app/[locale]/cart/recommendations-shell.tsx` |
| The type                  | `lib/cart.ts` (`CartRecommendation`)          |
| The CMS picker            | `components/admin/recommendations-editor.tsx` |
| Its state, ×6 forms       | `hooks/use-recommendations-editor.ts`         |

- ⚠ **Nothing here filters anything.** Deduping across lines, dropping what is
  already in the cart, dropping the unbuyable and dropping a currency the basket
  cannot pay in all happen server-side, where the whole cart is visible at once.
  Re-deriving any of it in the browser is how the strip comes to disagree with
  the cart it sits under.
- **It arrives on the cart payload**, which is what makes "added it, so stop
  offering it" free: a signed-in add already calls `router.refresh()`, and a
  guest add writes `localStorage`, which re-resolves through
  `/api/guest/resolve`. There is no second fetch and no client-side bookkeeping.
- **Two renderers, one shell**, the same split `favorites/page.tsx` and
  `favorites/guest-favorites.tsx` carry: the signed-in strip is a **server**
  component drawing `BuyableCard`, so hearts and the admin shortcut resolve the
  way they do in every other grid; the guest one draws `BuyableCardView` because
  its items only exist after hydration and an async server component cannot be
  called from there. `RecommendationsShell` holds the markup they would otherwise
  each own, and takes its heading as a **prop** - `useTranslations` and
  `getTranslations` are not the same hook, and that one module compiles into both
  graphs.
- **The cards are the ordinary catalog card**, deliberately - not a cut-down
  "recommendation card". Adding one to the cart is the entire point, so the add
  button, the customiser modal, the heart and the price all have to behave
  exactly as they do in a grid. That is also why the API sends a **full** item
  payload rather than a reference. `fromLabel` is `Menu.from`, the key every
  other grid uses.
- Cards go `{ xs: 6, sm: 4 }`: the strip lives inside the cart's 7-of-12 column,
  so it has less width than a catalog grid.
- **In the CMS the picker is on all six forms** - product, service, menu item and
  their three categories - because all six author the same relation. It differs
  from `VariantsEditor` in the two ways the relation does: the list is **grouped
  by family** and a selection is a `{kind, id}` ref (an id alone cannot say which
  table it is in), and there is no "this also appears on the other item" caveat,
  because the link is one-way.
- ⚠ **On an item form, an empty picker means "inherits", not "recommends
  nothing"** - so the editor prints what is currently being inherited
  (`recommendationsInherited`), for the reason `menu-sizes-editor.tsx` says what
  a dish is inheriting rather than "no sizes yet": otherwise an operator goes off
  to re-tick rows the category already defines. `categoryId` follows the _form's_
  category field, not the saved row, so re-filing a dish updates the readout
  before the save.
- **Selection order is the strip's order** - the API stores each ref's position
  as its `sort_order`, so the picker appends on select rather than sorting.
- **`recommendations` is always sent on save**, like `variants` and
  `booking_branches`: an empty list has to actually clear the record's own rows,
  which is how an item is handed back to inheriting its category's.

## Customising a dish - two pickers, four surfaces

A menu item is configured by **`components/menu-size-picker.tsx`** (which size)
above **`components/menu-ingredient-picker.tsx`** (what goes on it), and by
nothing else. Four places ask the same questions of the same data, and each one
is a thin shell around those two components:

| Surface          | Shell                                              | Selection lives in                |
| ---------------- | -------------------------------------------------- | --------------------------------- |
| Item detail page | `menu-item-customizer.tsx`                         | `MenuCustomizationProvider`       |
| Catalog card     | `menu-customize-modal.tsx` (a `ConfirmationModal`) | local state                       |
| Cart line        | the same modal, with its `editing` prop            | local state, seeded from the line |
| POS till         | `pos/_components/pos-customizer-modal.tsx`         | local state                       |

- **Both pickers are fully controlled and own no state**, because the detail
  page's nutrition label has to mirror the customer's selection from a different
  grid row - so the selection is lifted into the context there, while the two
  modals keep it locally.
- ⚠ **Size renders first, above the add-ons, on all three.** It is the first thing
  a customer decides about a dish, and it moves the base price the add-ons are
  added to.
- **The space between the two is `MENU_CUSTOMIZER_GAP`, one number for all of
  them** (`components/menu-customizer-spacing.ts`), a step above the rhythm
  inside the pickers themselves - which size and what goes on it are two
  separate decisions, and packed to that tighter rhythm the add-on list reads
  as a caption under the size row. Each shell renders the pair inside its own
  column so the number _is_ the gap; don't re-express it as a `marginTop` on
  the add-ons, which lands on top of whatever gap the surrounding column
  already has and is how the three drifted to 28 / 14 / 0 px.
- **The arithmetic is `lib/menu-selection.ts`, shared for the same reason.**
  A dish configured at the counter and the same dish configured on the site must
  never quote different numbers. None of it is authoritative: the server
  re-prices every selection in `price_for_selection`.
- **POS differs only by `size="lg"`**, which grows the hit targets for a finger
  over a counter. Don't fork the markup to change the till's look - the three
  copies this replaced had already drifted (only the detail page showed the
  ingredient's photo and explained the free-portion allowance).
- **How much of an add-on goes on the dish is `components/portion-picker.tsx`**,
  not a stepper: `PortionGauge` prints the amount ("40 g") over three circles
  that grow with it, and pressing it unfolds `PortionSlider` beneath the row -
  every portion the kitchen allows as a mark, the amount over the money it adds.
  A `− n +` stated the number and nothing else, so "2" said neither how much
  pineapple that is nor how much the dish can take.
  ⚠ **The circles are a proportional gauge, not a count** (`gaugeLevel`): an
  ingredient may allow one portion or six and three circles have to read as
  low/medium/high for both, so the lit count is `ceil((qty − min) / (max − min) ×
3)` and an ingredient at its floor lights none.
  ⚠ **A mark's price line is the up-charge, and only when there is one.** It
  mirrors `selectionUpcharge` term for term (the base has already paid for
  `included_units`), so the free portions carry no price line at all - printing
  "+0" under three marks says nothing and crowds a label that is 11px wide. It
  carries **no currency** either: the row above already quotes the per-unit price
  in it.
  ⚠ **Only one slider is open at a time** - `MenuIngredientPicker` owns `openId`,
  not the control - or a dish with six add-ons unfolds into a column of sliders.
  The panel is **folded, never unmounted** (a zero-height grid row), so it
  animates closed as well as open, and `visibility` is what takes it out of the
  tab order meanwhile - the same pattern the phone menu index uses.
  **The apply button only puts the control away**: the quantity is already
  written, since the slider fires on every move.
  ⚠ **The panel scrolls itself into view when it opens**, through
  `scrollToElement` at `block: "nearest"` (never a bare `scrollIntoView`) - the
  gauge of the last ingredient in a long list sits at the bottom of the modal, so
  the slider it unfolds landed below the fold and the press read as having done
  nothing. `"nearest"` is what keeps it to "a little bit": an already-visible
  panel does not move the page at all. It waits `PORTION_FOLD_MS` first, which
  **is the `grid-template-rows` transition in `portion-picker.css`** - keep the
  two in step, since a scroll aimed at the panel while it is still a zero-height
  row lands short of it.
- ⚠ **A food card's add-to-cart icon opens the modal; it does not post the base
  line.** It used to, which silently chose the defaults for a customer who may
  have wanted the dish without onions, and gave no hint the dish was
  configurable at all. A dish with **neither** add-ons nor a choice of size still
  adds in one click, and the **remove** state is unchanged - a click on a dish
  already in the cart deletes the line, with no modal. A choice of size is on its
  own enough to ask: adding the default silently would pick the pizza's diameter,
  and its price, on the customer's behalf.
- **A cart row re-opens that same modal rather than growing its own editor**
  (`cart/cart-line.tsx`, the pencil beside remove). It is the add modal with
  `editing` set: the pickers open on the line's stored selection, and OK calls
  the caller's write instead of adding a line - a `PATCH` on the row for a
  signed-in customer, `setGuestCartSelection` for a guest. There is still no
  quantity stepper inside it; the row's own is right behind the modal, and a
  second one could only disagree with it.
  ⚠ **The pencil needs `CartCustomizationRow.option`**, which is the chosen
  alternative's id. The row's `name` is what the cart _prints_ and cannot be
  turned back into the id the picker selects on, so without it a re-opened
  customiser would silently offer the default in place of what was bought.
  ⚠ **An edit can merge two lines** - identity is the dish plus its size and
  selection - so the guest list is keyed by that identity rather than by the
  line's index: on a merge every later index shifts, and a row's optimistic
  quantity would otherwise stay attached to its neighbour. The API side is in
  website-api's CLAUDE.md → "Editing a cart line".
- ⚠ **A sized cart line always reads as `customized` in `/api/auth/cart/ids/`**,
  so a card never offers "remove" for it. With a small _and_ a large of one dish
  in the cart, a card that offered to remove one could not say which.
- **`enabledIngredients` lives in `lib/menu-selection.ts`, not beside the detail
  page's components** - the card's customiser is a client component and cannot
  import from a server one. A disabled row is an admin's "not right now" and
  reaches no customer-facing surface. ⚠ The API does **not** filter it: the
  nested `ingredients` on `MenuItemSerializer` carry every row, and
  `price_for_selection` prices a disabled one at its `default_units`.

### Sizes

A dish's `sizes` are authored per **menu category** and optionally _replaced_ on
one dish. The API side owns every rule; read website-api's CLAUDE.md → "Menu
sizes" first.

- ⚠ **`item.sizes` is already the effective list** - own rows if any, else the
  category's, empty when `sizes_enabled` is off. The server resolves that; never
  re-derive "own else category's" on the client, or a dish shows one list on its
  detail page and another at the till.
- **The arithmetic is `menuItemTotal` in `lib/menu-selection.ts`**, shared with
  the ingredient up-charge for the same reason: a pizza configured at the counter
  and the same pizza configured on the site must not quote different numbers.
  Display only - the server re-prices every selection.
- ⚠ **The card's "from" price is `lowestPrice(base, sizes)`**, not the base. With
  a small size that _discounts_ the base, a "from" prefix over the list price
  names a price the customer can beat. `effectivePrice` stays the list price -
  it is what the compare-price discount is measured against and what the modal
  applies its deltas to.
- **Only the size's delta is printed on a chip, signed** (`−40` / `+40`); a zero
  delta prints nothing, since the size sold at the list price should not shout
  about it. The measurement (`"12 in"`) is **pre-composed by the API**, so the
  trailing-zero trim lives in one place.
- **In the CMS, `components/admin/menu-sizes-editor.tsx` is one editor for both
  owners** - the menu-category form and the menu-item form - differing only in
  its framing (`scope`), which is the whole reason it is one component. A dish's
  list is its **override**: empty means "inherit", so the editor says what is
  being inherited rather than "no sizes yet", which would send an operator off to
  re-type five rows the category already defines. `persistMenuSizes` is shared
  too, and the subtle part of it is reconciling the ids the API assigns - without
  that, a second save re-POSTs every new row and the operator ends up with every
  size twice.
- ⚠ **The default is a radio, not a switch**, and picking one clears its siblings
  locally as well as on the API. The API has to do it (rows are PATCHed one at a
  time); doing it locally too is what stops the operator seeing two filled radios
  until they reload, which reads as a lost save.

## POS - the counter-sale till (`/pos`)

`app/[locale]/pos/` is an **admin-only** point-of-sale screen: a store associate
rings up a walk-in customer against the same tenant catalog the public site
sells. It needs no per-site code and no new backend models - it is a platform
route, like `/cart`.

- **Guarded twice, on purpose.** `proxy.ts` keeps an anonymous visitor off the
  route; the `session?.isAdmin !== true → notFound()` in `page.tsx` covers what a
  prefix guard cannot - a _signed-in but ordinary_ customer, who sails past it
  with a valid session. Neither is what protects the money: Django re-derives
  both from the token on every call. They decide what is worth rendering.
- **The whole catalog is loaded once, server-side**, and handed down as one flat
  `PosCatalogItem[]` (all three Buyable families flattened, names already
  resolved to the operator's locale). A till runs over a shop's wifi with a queue
  waiting: it should paint once and then be pure client-side state, not fetch a
  category per tap.
- **The basket holds references and display copies, never an authoritative
  price** - the same rule as `lib/guest-cart.ts`, for the same reason.
  `POST /api/orders/admin/pos/` re-reads every line out of the catalog and prices
  it there; if the screen and the server ever disagreed, the server's answer is
  what is charged.
- **It is deliberately not persisted.** A counter sale lives for the ninety
  seconds between ringing it up and taking the money; writing it to
  `localStorage` would mostly resurrect yesterday's half-finished shift onto
  today's screen. Don't "improve" this by adding persistence.
- Use `Button size="xl"` for till controls - that size exists for finger-driven
  UIs.

## Order board - the screen orders are worked from (`/order-board`)

`app/[locale]/order-board/` is the till's counterpart: `/pos` **creates** orders
at a counter, this **works through** them - whatever their source (the
storefront, a guest checkout, or the till in the next room). It is the screen a
cook watches on a mounted iPad: a rail of tickets on the left, the open one on
the right, and one big button that says it is done. Like the till it is a
platform route with no per-site code and no new backend models, reading the same
`/api/orders/admin/` the CMS list reads.

| Piece                  | Where                                     |
| ---------------------- | ----------------------------------------- |
| Guard + shell          | `order-board/page.tsx`, `order-board.tsx` |
| Rail, ticket, waiting  | `order-board/_components/`                |
| Which orders, how late | `lib/order-board.ts`                      |
| The arrival sound      | `order-board/chime.ts`                    |

- ⚠ **It introduces no order states, and must not.** The board is a _view_ over
  the two statuses an order can already be in, and its only writes are
  `mark_fulfilled` / `unmark_fulfilled` - two of the actions `/admin/orders`
  makes. A kitchen's "accepted" or "in progress" is a model change in
  website-api, not a third meaning quietly given to `fulfilled`, which the CMS
  _and_ the customer's own order page both read.
- ⚠ **It takes no money, and there is no "Mark paid" on it.** This screen
  _processes_ orders; settling payment is the cashier's, on `/pos` or in the
  CMS. A payment button on a tablet in a kitchen is a state change made by
  whoever is not holding the cash. The "Unpaid" chip stays - a cook packing an
  offline order needs to know the counter has to collect - it is simply not
  actionable from here.
- **`paid` and `placed` only.** `pending` is deliberately off the board: it is a
  Stripe session that has been opened and may never be paid, so showing it asks
  a cook to make food nobody has bought. `placed` (pay in store / on delivery)
  **is** on it - the customer committed - which is why a ticket can carry an
  "Unpaid" chip. **Both statuses are worked from, which is what makes paying an
  order invisible to the board**: a ticket collected on at the till moves
  `placed` → `paid`, stays exactly where the cook left it, and only loses its
  chip on the next poll. Don't "fix" that by filtering the board to one status.
- **Oldest first**, the opposite of the CMS list's newest-first. That list is a
  ledger, where the last thing that happened is the interesting one; here the
  oldest ticket is the customer who has waited longest.
- ⚠ **A fulfilled ticket is not removed from the rail** - it drops below the
  waiting ones under a "Fulfilled" divider, dimmed and badged, newest first and
  capped at `BOARD_FULFILLED_LIMIT` (20). The unfulfilled always come first
  whatever the clock says: the rail is a queue of work, not a log, so an order
  still to be made must never be pushed down the screen by one already in the
  customer's hands. Past twenty, a ticket is `/admin/orders`' business.
- **It polls; there is no SSE for orders.** Twenty seconds, paused while the tab
  is hidden and caught up on the way back into view. A chime and a toast fire on
  a `public_id` the board has never held - a `Set` of every id ever seen, not a
  diff against the previous poll, so a ticket un-fulfilled by mistake doesn't
  re-announce itself. ⚠ **The first load seeds that set silently**: announcing a
  queue of ten as ten new orders is noise, and the chime has to mean "one just
  came in". ⚠ **Arrivals are decided over the _waiting_ tickets only** - a
  fulfilled one is not news, and now that it stays on the rail, folding it in
  would chime for every order the board has ever finished.
- ⚠ **The chime is synthesised (Web Audio), not an audio file**, and an
  `AudioContext` made before a user gesture starts `suspended` - so it is
  created from the shell's capture-phase click handler (the operator's first tap
  anywhere), never at module load. Nothing throws where Web Audio is missing: a
  silent board is still a working board.
- **The open ticket is derived, never defaulted into state**, from a three-way
  `Selection` rather than a nullable id - because "nothing is open" and
  "whatever is oldest" are different answers and one `null` cannot hold both.
  `auto` shows the oldest waiting ticket and hands itself to the next as that
  one leaves (an order fulfilled on another tablet needs no effect racing to
  correct a stale selection); `picked` is a tap; `none` is the empty pane.
- **Marking fulfilled empties the detail pane** (`none`) - what it was showing
  has been made, so nothing on it is a live instruction any more - and on `xs`
  closes the sheet, since the operator now needs the rail. Nothing is thrown
  away: the ticket is still on the rail in the fulfilled group, and **re-opening
  it is where the undo lives**. That undo is why the group exists; a tap that
  made a ticket vanish with no way back is the one mistake a busy counter
  actually makes.
- **Exit is behind a `ConfirmationModal`, exactly as the till's is.** Nothing
  unsaved is lost here, but leaving stops the polling and the chime - a stray
  tap on a screen someone is cooking from is how an order goes unnoticed until
  the customer asks about it.
- **The list endpoint carries no lines**, so the rail shows a reference, a
  waiting time, an item count and a total, and the lines come from one detail
  fetch per selection. But the list carries **every** order (it does not filter),
  so a poll is also fresh news about the open ticket: `status` and `fulfilled`
  are folded in from it rather than costing a second request every twenty
  seconds. The lines themselves cannot change once an order exists.
- **The waiting chip's three levels are fixed** (10 / 20 minutes), not
  per-tenant: they are a presentation nudge, not a promise about prep time. A
  pizzeria's idea of late belongs in the CMS beside a real prep-time field if it
  is ever wanted.
- **Statuses and payment-method labels come from the `AdminOrders` namespace**,
  not a second copy under `OrderBoard` - that namespace already covers every
  method an order can carry, and two copies could only drift.
- **Full-screen, like the till**: `components/hide-on-admin.tsx`'s
  `HideOnFullScreenTool` (formerly `HideOnPos`) now takes both routes out of the
  site chrome, and both are in `proxy.ts`'s `protectedPrefixes` **and** re-check
  `isAdmin` in their `page.tsx` - a prefix cannot tell a signed-in ordinary
  customer apart from an admin.

## Media comes from a CDN, not from this pod (`image-loader.ts`)

In production every uploaded file lives in Cloudflare R2 and the API returns an
**absolute** URL on the bucket's hostname. `next.config.js` sets
`images.loader: 'custom'` + `loaderFile: './image-loader.ts'`, and that loader
returns an absolute URL **untouched** so the browser fetches it straight from the
edge. **Everything else is returned untouched too**, including relative
`/public` paths — see the next bullet for why that is not a missed optimization.

- ⚠ **`/_next/image` does not exist in this app.** Next serves the optimizer
  route only for the default loader: `next-server` 404s it unconditionally when
  `images.loader !== 'default'`, whatever `images.remotePatterns` says. So the
  loader must return every src as-is (emitting the optimizer's URL shape "for
  local assets" yields a 404 and a blank image), `remotePatterns` is **inert
  config** that gates nothing at runtime, and adding a customer's CDN hostname
  there fixes nothing.
- **Nothing gets per-viewport resizing**, by design: website-api already caps
  every upload at its tier (`core/image_sizes.py`, 256–3840 px), so what is
  stored is what is served. Commit `/public` art at roughly its drawn size and
  give large images an explicit `sizes` rather than reaching for the optimizer.
- **The same-origin door is `app/api/media/route.ts`** (`/api/media?url=…`), a
  byte-for-byte passthrough this app owns. The features that need _same-origin
  pixels_ rather than a fast image go through it via
  `lib/same-origin-image.ts`: the flyer exports (`html-to-image` taints the
  canvas on a cross-origin fetch) and the branch map capture. It allowlists by
  **request host** — the site's own domain and any subdomain of it (so
  `r2.<customer>.com` on `<customer>.com` works with no configuration),
  `**.iguzman.com.mx`, and anything in `MEDIA_PROXY_HOSTS` — so onboarding a
  customer needs no entry anywhere, which a build-time `remotePatterns` could
  never manage. ⚠ Keep that allowlist and the `image/*` content-type check
  narrow; together they are what stops the route being an open proxy.
- ⚠ **The hero `logo`-shape CSS mask is still broken in production** for any
  tenant whose media is on a separate origin: `heroLogoMaskUrl` in `@repo/ui`
  still points at `/_next/image`, so the mask resolves empty and clips the badge
  away. Fixing it means letting the app supply the proxy path (the package is
  shared with `apps/animals`, which has the same dead route).

## Storage (`/admin/system`, staff only)

`storage-section.tsx` is where a tenant connects **its own Cloudflare R2
account**, so its images and backups live in its bucket and serve from its CDN
hostname instead of the platform's. It sits above Backup & Restore because it
decides _where_ a backup is written. Like them it is outside the page's
`AdminForm` and owns its own requests. The engine is `core/storage.py` in
website-api — read that CLAUDE.md section before changing either side.

- **Rendered only for `session.isStaff`**, unlike every other section on the
  page: repointing a site at a
  different bucket changes where every file is read from and written to, and a
  wrong value breaks uploads for the whole tenant. That is an operator action,
  not a customer one. It is presentation only — the API re-derives staff from
  the token on every call. ⚠ Claims freeze for the life of the refresh token, so
  an account promoted to staff must sign in again before the section appears.

- **The secret key field always loads blank and a blank value is dropped from the
  payload**, never sent as `""`. The API has no read path for it, so submitting
  the empty field verbatim would wipe a working bucket the first time anyone
  toggled the switch. Exactly the Stripe rule on `/admin/payments`.
- **Reads come from `GET /api/system/<pk>/storage/`, not `getSystem`.**
  `GET /api/system/` is `AllowAny` and feeds every public page; the bucket name
  and access key id are not on it.
- **"Test connection" sends what is in the form**, so a typo fails in the CMS
  rather than on a customer's next upload, and any edit clears the previous
  verdict — a green "connected" beside a field that has since changed is worse
  than none.
- **The section says out loud that connecting a bucket moves nothing**, and
  nothing in the CMS will move it. Only future uploads land in the new bucket;
  the existing files keep serving from the old one, where their stored paths
  resolve. An operator who assumes otherwise goes looking for broken images that
  are not there — or, worse, expects a migration that no longer exists. The
  staff-only "Migrate stored media" section that used to sit under this one was
  removed with the hostPath volume it copied off; see website-api's CLAUDE.md.

## Backup & restore (`/admin/system`)

The bottom of `/admin/system` carries two sections a tenant runs against its own
data: **Backup** (`backup-section.tsx`) downloads the site as a zip and keeps a
history of restore points, and **Restore** (`restore-section.tsx`) uploads one
back. Both pick their scope with the shared `backup-sections.tsx` switch row.
The engine, the archive format and the tenancy rules live in `website-api`
(`core/backup.py`) — read that CLAUDE.md section before changing either side.

- **Both sections sit _outside_ the page's `AdminForm`, not inside it as
  `children` like `ContactSection`.** They own their own requests and buttons;
  nested, the backup-name field's Enter key would submit the System form instead.
- **Download and restore do NOT go through `/api/admin/[...path]`.** That proxy
  re-encodes every body and response as JSON, which corrupts a zip on the way out
  and destroys the multipart boundary on the way in. They have dedicated handlers
  at `app/api/backups/[id]/download/` (streamed passthrough) and
  `app/api/backups/restore/`. Only the JSON list/create/delete calls use the
  proxy, which is why `backups/` is in its `ALLOWED_PREFIXES`.
- **The restore upload is buffered, not streamed, on purpose.** `apiFetch`
  retries once on a 401 and a `ReadableStream` body cannot be replayed — streaming
  would turn every expired-token restore into an unexplained failure _after_ the
  whole archive had been sent.
- **The progress bar is indeterminate and should stay that way.** Building or
  applying an archive is one synchronous request with no way to report a
  percentage back mid-flight; a fake percentage would be worse than an honest
  animation. A real one needs a job-state model and polling, not a UI change.
- **`restore-section.tsx` surfaces the API's own `detail` on a 400.** The two
  failures operators actually hit — an archive from another site, and a section
  the archive lacks — are both explained precisely by the server, and collapsing
  them into a generic "restore failed" leaves nothing to act on.
- **"All" is derived from the selection, never its own state**, so the row cannot
  show All-on beside a half-empty selection; it locks the individual switches
  while on.

## Rewards - points on a card, a choice in the cart

With `System.rewards_enabled` on, a catalog card prints an item's points price
beside its money one ("MX$120 / 1200 points"), a cart row offers the two as a
pair of buttons, and the summary says what the points covered. The API owns every
rule; read website-api's CLAUDE.md → "Rewards" first.

| Piece                       | Where                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| The points price on a card  | `components/buyable-card-view.tsx`                                     |
| The same, on a detail page  | `product-detail.tsx`, `service-detail.tsx`, `menu-item-customizer.tsx` |
| The money/points buttons    | `app/[locale]/cart/cart-line.tsx`                                      |
| The summary's points rows   | `app/[locale]/cart/cart-summary-card.tsx`                              |
| Balance, tier, statement    | `lib/rewards.ts`, `app/[locale]/account/rewards-card.tsx`              |
| The CMS switch + the ladder | `app/[locale]/admin/system/rewards-section.tsx`                        |
| The catalog numbers         | `components/admin/pricing-section.tsx` (+ the three category forms)    |
| Types                       | `lib/cart.ts` (`CartRewards`), `lib/rewards.ts`                        |

- **The points calculator asks one question, both ways round.**
  `components/admin/points-calculator-modal.tsx` ("Help me to calculate", on the
  three item forms) takes **purchases before one is free** _or_ **the percentage
  you give back** - the linked pair in `points-give-back.tsx`, which the Rewards
  bulk action renders too, so the two surfaces cannot come to mean different
  things. ⚠ **The count is the stored truth and a typed percentage is rounded to
  one**: `points_price` is `visits × award` _exactly_, so the promise ("buy it
  ten times and the eleventh is free") only holds while those two divide, and
  6.67 purchases divides nothing. The readout quotes the _effective_ percentage
  back for that reason. ⚠ **It reads the selling price and no longer asks for
  it** - that box was a second place to type a number the form already carries,
  and applying it let a dialog about points rewrite the price; with no price on
  the form it says so and refuses.

- ⚠ **Nothing in the browser ever computes a balance, an award or an
  affordability.** `cart.rewards` is resolved server-side over the **whole**
  basket, because whether a redemption fits is a question about every redeemed
  line against one balance at once - a row deciding for itself would let three
  separately affordable lines add up to an unaffordable cart. The row is still
  the thing that has to _say_ it, which is why `CartLine` measures `linePoints`
  against `balance − (points_used − this line's own share)` rather than against
  the raw balance.
- ⚠ **`cart.totals` already excludes every redeemed line.** It is what checkout
  will actually charge, so the summary's points row is a **statement** of what
  the points covered, never a deduction still to be applied - which is why it
  prints as a plain figure rather than a signed one. The same rule governs the
  order page's `points_spent` line. Subtracting `points_value` from a subtotal
  again is the one arithmetic mistake these blocks invite.
- **"Its equivalent in money" is the sum of the displaced line totals, never a
  conversion rate.** Points are priced per item, so there is no single rate to
  convert at, and inventing one would put a number on the summary that no
  operator ever typed.
- **The two buttons are `Button`s, not a switch or a radio pair**, because each
  one has to _state a price_: the choice is between two amounts, not two
  settings. The scale is `primary`/`success`/`error`/`warning` - there is no
  `"secondary"` - so the selected one is `kind="primary"` and the unselected one
  is the default button. ⚠ The points button is **disabled, not hidden**, when
  the balance falls short: hiding it removes the only hint that the dish is
  redeemable at all, which is exactly what makes a customer want to earn more.
- **A guest gets the card's points price and none of the cart's buttons.**
  `cart.rewards.enabled` is false for a guest whatever the tenant switched on -
  there is no account to hold a balance - and `CartLine` is given no
  `onPayWithPointsChange`, so there is no choice for the row to offer. The
  invitation to sign up lives in the confirmation email, where the points they
  just earned are waiting.
- ⚠ **`line.pay_with_points` is safe to paint a selected button from.** The API
  reports it false whenever the line could not actually be redeemed - the tenant
  may have cleared the item's points price while it sat in the basket - so it
  never says "points" for a line checkout would charge in money. The **stored**
  flag is left as the customer set it, so their choice comes back if the item
  returns to the program.
- **The toggle is a third writer of the one cart endpoint**, on the same "only
  what is sent is applied" contract the quantity stepper and the customiser
  share: flipping a line to points must not disturb its quantity or its
  ingredients, and the stepper must not reset the payment choice.
- **`INSUFFICIENT_POINTS` has to be sayable in `checkout-section.tsx`**, beside
  the `COUPON_*` codes and for the same reason: the balance can move between the
  cart painting its buttons and checkout re-checking it under a lock, and a
  refusal only the cart could explain would surface at checkout as an
  unexplained failure.
- **A detail page prints the same points price beside its own money one**, in
  `.item-points-price` - the price's weight at a smaller size, in
  `--accent-text` (ink, not a fill). It trails the compare price and its
  discount chip, which belong to the money price between them. ⚠ On a **dish**
  it sits beside the customiser's live total, and it does **not** follow it:
  `points_price` is the item's base figure, unmoved by the size and the add-ons
  the total above is recomputing, because there is no per-size points column to
  derive a delta from. It is the same number the card printed and the same one
  the cart's points button will offer.
- ⚠ **`rewardsEnabled` reaches the card from its _server_ half.** `BuyableCard`
  resolves `getSystem()` (request-`cache()`d, so a grid of twenty costs one
  fetch) and passes it down; a client card that fetched it would do so once per
  card.
- **In the CMS the switch and the ladder are saved by one button** -
  `/admin/system`'s own. `rewards_enabled` is an ordinary `System` key in the
  page's `values`; the tiers are **rows**, so the page holds them in state and
  `handleSubmit` runs `persistRewardTiers` after the System write, exactly as the
  menu-item form runs `persistMenuSizes`. `RewardsSection` is pure and controlled
  and owns no request. ⚠ `persistRewardTiers` reconciles the id the API assigns,
  like `persistMenuSizes`: without it a second Save re-POSTs the tier and the API
  refuses the duplicate threshold, making a working form look broken. It reports
  a `failed` flag rather than throwing, so a tier the API refuses is said so of
  _itself_ - the System fields above it did save.
- **A tier card carries its ES/EN name pair in its top row, beside delete**, and
  that pair is `components/admin/bilingual-name-fields.tsx` - the same control an
  ingredient row's choice-group label uses, with its per-field AI translate
  button. Two-up from `sm`, like the ingredient cards.
- ⚠ **Both catalog fields are blank-means-something, and the meanings differ.**
  A blank _award_ inherits the item's category; a blank _points price_ means the
  item cannot be redeemed. So every form sends `null` for an empty box - listing
  both keys in its blank-to-null sweep - and never coerces to 0, which on the
  award is the different claim "earns nothing". The item fields live in the
  shared `PricingSection`, so all three catalog forms get them at once; the
  category field is an ordinary `FieldDef` on each of the three category forms,
  using the `helperText` this added to `FieldDef`.
- **`/account` shows the balance, the tier and a short statement**
  (`RewardsCard`), because the confirmation email's "See my points" button leads
  there - without it that button is a dead end. It renders **nothing** when the
  tenant runs no program, so every other site's account page is unchanged.
  `AccountForm` is shared with cinelog and edge-folio through `@repo/auth`, which
  is why the card sits beside it rather than inside it - in that component's
  **`aside`** column (see `packages/auth/CLAUDE.md`), which is where the next
  site-specific card, addresses say, goes too. ⚠ It is **not** a sibling rendered
  above the form: the form owns the page's only container, so a card placed before
  it painted underneath the fixed navbar. ⚠ And `page.tsx`, not the card, is what
  reads `getRewards()` - a card that renders null is still an element, and passing
  one unconditionally would give every tenant with no program a two-column account
  page with an empty half.
- ⚠ **`lib/rewards.ts` is not `cache()`d**, matching the API: a balance moves on
  every checkout and is what a customer is about to decide on. Same exception
  `getOrder` carries while `getOrders` is cached.

## Coupons - a discount code, its QR, and its flyer

A tenant creates a coupon in `/admin/coupons`, downloads a flyer carrying its QR,
and a customer who scans that QR lands on `/coupon/<code>` and shops with the
code already applied. The API owns every rule; read website-api's CLAUDE.md →
"Coupons" first.

| Piece                     | Where                                      |
| ------------------------- | ------------------------------------------ |
| The CMS list / one coupon | `app/[locale]/admin/coupons/`, `.../[id]/` |
| The four flyer templates  | `components/admin/coupon-templates/`       |
| The "have a coupon?" box  | `components/coupon-field.tsx`              |
| What a coupon applies to  | `components/admin/coupon-scope-picker.tsx` |
| Formatting, client-safe   | `lib/coupon-shared.ts`                     |
| The scanned-code carrier  | `lib/coupon-stash.ts`                      |
| The public landing        | `app/[locale]/coupon/[code]/`              |

- ⚠ **Nothing in the browser ever computes a discount.** The amounts
  `CouponField` shows come from `POST /api/coupons/validate/`, and even those are
  only for display - checkout re-validates the code and re-prices the order
  server-side. **Only the code travels in the checkout body**, exactly as the
  cart travels as references and never prices: a client that could name a
  discount could name its own price.
- **A coupon can be aimed at one catalog target**, and the two selects that do
  it are `CouponScopePicker`: every category on the site, and every buyable on
  it. **Picking in either clears the other** - a coupon has exactly one target,
  so a coupon that was "all Pizzas" and is now "the Margherita" is not both, and
  a select left showing its abandoned pick would be a control saying something
  the coupon does not. It writes `scope_kind` + `scope_id`, which are **always
  sent as a pair** (including empty): clearing a target has to write the
  order-wide scope back, and the API refuses one half without the other.
  ⚠ It is deliberately **not** `CatalogRefPicker`. That one fills a fixed number
  of _slots_ from the three buyable families and never sees a category; this is a
  single-value, mutually-exclusive choice over **six**. The `${kind}:${id}`
  encoding is all they would have shared, and it is two lines.
- ⚠ **The scope restricts the discount, and only the API decides how.** A scoped
  coupon is priced off the matching lines alone, and a basket holding none of
  them is refused with `COUPON_NOT_APPLICABLE` - a new code both `ERROR_MESSAGES`
  maps have to speak, for the same reason they speak the other `COUPON_*` ones.
  Nothing in the browser may form an opinion about it; see website-api's
  CLAUDE.md → "Coupons".
- ⚠ **The picker reports the picked row, not just its id, and that is
  load-bearing.** `coupon.scope` is the API's snapshot and cannot know about a
  pick made a second ago, so a form drawing the preview from it alone would show
  the _previous_ target's photograph until the operator saved and reloaded - on
  the one screen whose whole job is showing them what they are about to print.
- **The landing page says what a scoped coupon covers**, with the target's own
  catalog photograph, above the code and before "Start shopping" - not when the
  cart refuses a basket the visitor has already filled.
- ⚠ **Applying a coupon reserves nothing.** The code can be taken by someone else
  between the validate call and checkout, which the API refuses honestly at that
  point (`COUPON_EXHAUSTED`) rather than charging full price. That is why
  `ERROR_MESSAGES` in `checkout-section.tsx` and `failureMessage` in the POS
  charge panel both have to speak `COUPON_*` - a refusal that only the coupon box
  could explain would surface at checkout as an unexplained failure.
- **One field, two consumers**, like the ingredient picker: the cart's checkout
  section and the POS charge panel both render `CouponField`, and it is fully
  controlled - both parents need the quote elsewhere (the cart's summary, the
  till's amount due), so a field holding its own copy would be a second source of
  truth about what is being charged. POS differs only by `size="lg"`.
- ⚠ **The till's "amount due" comes from the API's quote, never from
  `total - discount` recomputed locally.** A rounding rule that differs from
  Django's puts a different number on the screen than on the receipt, with a
  customer standing there.
- **A scanned code rides in `sessionStorage`, not a URL param**
  (`lib/coupon-stash.ts`) - the same call `apps/cinelog` made for its AI search.
  A `?coupon=` param has to be threaded through every link between the landing
  and the cart to survive, and makes the code part of every URL the customer
  might share. `sessionStorage` rather than `localStorage`: a cart persists for
  weeks because the customer means to come back to it, but a coupon scanned and
  abandoned should not resurface in a month attached to an unrelated basket.
- **`autoApply` is the parent's call, not the field's.** A guest's cart is read
  through `useSyncExternalStore`, whose server snapshot is empty, so it arrives
  one frame after hydration - auto-applying before then validates the code
  against an empty basket and refuses a coupon that actually meets its
  minimum-order rule. A refused auto-apply seeds the input instead of showing an
  error: the customer never typed it, so an unasked-for error reads as breakage.
- **The landing leads to the catalog, not the cart.** Someone who just scanned a
  poster has an empty cart, and a cart page telling them so is a dead end at the
  exact moment they were most willing to buy something.
- **`/coupon/[code]` is `noindex`.** Letting a search engine list every live
  campaign turns a targeted offer into a public discount feed, and leaves expired
  ones ranking long after the campaign ended. An **unknown** code 404s; an
  **expired** one does not - the API answers `valid: false` so the page can say
  the offer has ended, which is a better answer for someone holding a real flyer.
- ⚠ **`lib/coupons.ts` must stay uncached.** `valid` folds in whether the coupon
  is exhausted, which moves on every checkout - same reasoning that keeps
  `getOrder` uncached while `getOrders` is cached.
- **The order page shows subtotal + discount + total, or none of them.** With the
  total alone, an order placed with a coupon shows a number that does not add up
  from its own lines. `discount_amount` is `"0.00"` on every other order, so the
  block tests the **number**, not the string's truthiness.

### The flyer templates

`components/admin/coupon-templates/registry.ts` mirrors the social-post registry
exactly - four self-styled components (`ticket`, `bold`, `elegant`, `scan`), the
DB stores only the `id`, so **adding a template is a component plus one registry
entry, no migration**. `DEFAULT_COUPON_TEMPLATE_ID` must stay in step with
`Coupon.template_id`'s model default.

- **Kept separate from the social registry, not merged into it.** A social
  template composes an _item_ (photo, price, compare price); a coupon template
  composes an _offer_ (a code, a QR, an expiry). Neither can render the other's
  data, so one list would be a picker where most entries are wrong for whatever
  you are making. The pure helpers (`contrastText`, `tint`, `FORMAT_DIMENSIONS`)
  **are** imported from the social types rather than re-declared - per the shared
  constants rule.
- ⚠ **Everything drawn into a flyer must be a same-origin data URL**, the QR PNG
  included - it is served from R2 on a CDN hostname, so an `<img>` pointed
  straight at `coupon.qr_code` taints the `html-to-image` canvas and every
  download fails. Route it through `toSameOriginDataUrl` like the logo.
- **A scoped coupon's target is drawn by all four templates**, through the
  shared `CouponTarget` in `coupon-parts.tsx`: the item's or category's
  photograph in a round frame beside a three-line stack - a "Valid on" /
  "Valid on all" line composed upstream (so a template never needs a
  translator), the category, then the name. It renders **nothing** for an order-wide coupon, the contract
  every optional part here follows, and it drops the frame entirely for a target
  with no photograph - which is the common case for a category, not an edge one.
  A blank circle beside a name reads as an image that failed to load.
  ⚠ **The category and the name are two lines, not one composed string** - the
  category quiet and small (the `muted` tone, 26px) above the name at 40px, so
  the flyer still says where on the menu the offer sits without burying the dish
  in that sentence. They used to be joined on the form as `"<category> - <name>"`
  ("Pizzas - Margherita"), which printed the shelf and the dish at one size in
  one ink; don't re-compose them. Both travel as their own field on
  `CouponFlyerTarget`, so all four templates draw the same two lines, and a
  target with no category (every category scope, and an uncategorized product or
  service) drops that line rather than leaving a gap. The category reaches the
  form from two places and needs both: `CouponScopePicker`'s third callback
  argument for a pick made a second ago, and `scope.category_name` on the API's
  snapshot for a coupon just loaded.
  ⚠ **`elegant` and `scan` pass both of its colours explicitly.** Its default
  muted tone is a _lightened_ version of its ink, which is right on a filled
  panel and invisible on their near-white grounds.
  ⚠ **`scan` also subtracts the block's height from its QR budget.** That budget
  is a fixed assumption about the header (`h * 0.42`), not a measurement, so
  without the subtraction the thumbnail simply grows the header and pushes the
  symbol off the canvas - on the one template whose entire purpose is the scan.
- **`CouponBackdrop` falls back to the target's photograph** when no backdrop
  has been uploaded (so, today, on `bold`). A coupon for one dish over a picture
  of that dish is the flyer an operator would have built by hand, and it costs
  them an upload they have already made once in the catalog. The manual upload
  still wins, and the gradient is still the last resort - so an order-wide
  coupon with no upload looks exactly as it always did.
- ⚠ **A QR needs a white ground and its quiet zone.** `CouponQr` puts every code
  on a white tile for exactly that reason; drawn onto a brand-coloured panel it
  photographs badly under shop lighting, which for the one element the flyer
  exists to deliver is the worst thing it could be.
- **The ticket's perforation notches are painted in white, not cut out.** The
  export is a JPG, which has no alpha, so a transparent cut-out comes out as a
  black bite taken from the ticket.
- **The backdrop upload is not saved on the coupon**, deliberately - it only
  decorates the exported image, and persisting it would add a stored file per
  coupon that no customer-facing surface ever reads. **The logo plate _is_
  saved** (`brand_logo_background` + its two scales, the same trio a
  `SocialPost` carries) - it is part of how this coupon looks every time it is
  re-downloaded, which is the same reason `template_id` is a column.
- ⚠ **`CouponLogo`'s plate constants are deliberately not the social flyer's
  3.5 / 0.9.** There the base height is a small design token and the _bare_ logo
  is scaled up off it too; here the base height is the drawn logo height itself,
  so reusing those numbers triples the logo on every existing coupon. The pair
  in `coupon-parts.tsx` are **equal** (2 / 2), so both sliders at 100% draw the
  logo filling the plate edge to edge - there is no built-in inset, and a ring
  of plate around the mark is asked for by turning the logo slider down. The **shapes**
  are still the shared ones (`heroLogoBackgroundStyle` / `heroLogoMaskStyle`),
  so a hexagon cannot come out different here than on the hero or a post.
- **An unsaved coupon draws a dashed placeholder where the QR will go**
  (`qrPlaceholder`, `CouponQrPlaceholder`). The API mints the PNG on create, so
  before the first save the one element the flyer exists to deliver is a silent
  hole with nothing on screen to say it is temporary. It is set **only** while
  `isNew`: a saved coupon whose PNG write failed gets nothing, because there is
  no "once saved" left to promise.
- ⚠ **The tenant's Google Fonts `<link>` carries `crossOrigin="anonymous"`, and
  that is load-bearing for both exports.** `html-to-image` walks every
  stylesheet on the page to inline its `@font-face` rules, and reading
  `cssRules` on a stylesheet the browser considers origin-unclean throws a
  SecurityError - which surfaced on every Download flyer press. Requesting it in
  CORS mode (Google answers `access-control-allow-origin: *`) makes the sheet
  readable. `handleDownload` also retries once with `skipFonts: true`, since a
  stylesheet this app does not control - a browser extension's - can still
  poison the walk, and a flyer in a fallback face beats a button that refuses.

## Social posts - the flyer generator (`/admin/social-posts`)

The CMS can render a catalog item into a shareable Instagram/story flyer.
`SocialPost` (in `core`) stores the item reference, a `template_id` and a
`format`; **the templates themselves are code, not data.**

- **The template registry is shared and code-defined.**
  `components/admin/social-templates/registry.ts` lists six self-styled React
  components (`classic`, `bold`, `minimal`, `editorial`, `sale`, `profile`). The
  DB stores only the `id`, so **adding a template is a component plus one registry
  entry - no migration**. Never fork the registry into a `sites/<slug>/` folder;
  the CMS would never see it, and templates are meant to serve every tenant.
- **Export is `html-to-image` → JPG, and it is same-origin-sensitive.** Any
  remote image must be routed through `/api/media` (via `toSameOriginDataUrl`)
  before it lands in a template, or the canvas is tainted and the export fails
  on a CORS error. ⚠ Not `/_next/image`: that route 404s in this app - see
  "Media comes from a CDN". This is the same same-origin constraint as the
  hero's `logo`-shape mask and the shape divider's `brandmarkUrl`.
- **The badge shapes come from the shared
  `components/admin/logo-background-options.ts`**, which the hero's logo-badge
  picker also reads - so a flyer and the hero stay recognisably one brand. Extend
  that shared file, not a copy (see "Shared Constants" below).
- Copy assistance goes through `/api/ai/chat` like the rest of the CMS; there is
  no provider key in this app.

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

**The dev site switcher is a _public-site_ preview, not a CMS switch.** In
development, `app/[locale]/dev-site-switcher.tsx` writes the `__dev_site`
cookie so any site can be previewed on `127.0.0.1:3000`; it steers `getSite()`
→ `getTenantHost()` → the `X-Website-Host` every `lib/` helper sends. The CMS
does **not** follow it: `systemId` is a claim on the access token and Django
re-derives it from the same token on every write, so `/admin` always edits the
tenant you signed in as. That is the tenancy invariant (`core/tenancy.py`) and
must not grow a dev-only escape hatch.

Because the switcher is also rendered on `/admin` (from `admin/layout.tsx`,
bottom-**right** so it clears the fixed sidebar), that gap is closed by
`admin/dev-tenant-guard.tsx`: in development, when the previewed site has a
`System` of its own that isn't the session's, a `ConfirmationModal` says so and
its only action logs out and returns home. Keep the guard if you touch the
switcher - without it the CMS silently paints one customer's branding while
saving to another's data.

### `DEV_SITE` - naming the tenant before there is a cookie to name it with

⚠ **`localhost` matches no `System.host`, so a local `pnpm dev --filter=website`
has no tenant until you give it one.** Set **`DEV_SITE`** in `apps/website/.env`
to a site slug (`piccolopizzas`, `supertortaselchino`, …); `getSite()` reads it
in development, _below_ the `__dev_site` cookie so the switcher still wins, and
`turbo.json`'s `dev` task passes it through. It is ignored in production, where
the host is by definition one the ingress routed here.

**The cookie alone cannot do this job, because the request that matters most
happens before any cookie exists: the login.** `systemId` is a claim minted from
the request's resolved System, and Django's login builds the _username_ from
what it is sent (`build_username(system_id, email)`) - so an unresolved tenant
does not merely mislabel the session, it signs you in as a **different
customer's admin account**.

⚠ **That is why `getSystemId()` returns `null` rather than a number when the
host resolves to nothing, and why all five auth route handlers refuse with
`unresolvedTenantResponse()` (503).** It used to fall back to `1`, which is not
a neutral default - it is a real customer. On `localhost` that fallback fired on
_every_ login, and the symptom was not an error: the CMS saved happily onto
System 1 while the storefront, which resolves by host, never showed the rows -
so it read as "my menu items aren't saving to the local DB". Never reintroduce a
default here, in either direction: guessing a tenant is worse than refusing.

`DevTenantGuard` does not cover this case and cannot - it fires only when the
previewed site has a `System` **and** it differs from the session's, and an
unresolved host yields `null`, which it deliberately leaves alone.

**Interaction language.** The site skills (`/new-site`, `/seed-site`, and
`/site-design` when entered directly) each begin by asking the operator whether
to conduct the session in **English or Spanish**, then run all interaction —
questions, the seed interview, summaries, hand-offs — in that language. It's the
conversation language only; it doesn't change the code or the site's own content
language (the bilingual `en_*` seed fields are decided separately in
`/seed-site`).

## Hero video layout

`System.hero_video_layout` (`"default"` | `"none"` | `"profile"`) decides how the
logo and the text are composed over a hero video (`"none"` drops the logo and
keeps only the text/CTA), and applies in two places: the landing
`Hero` (`components/hero.tsx` → `@repo/ui/hero`) and the item detail hero
(`components/item-hero-video.tsx`, on product/service/food pages). The tenant
picks it in the CMS's "Hero video configuration" section
(`admin/logos-and-styles/hero-video-section.tsx`), whose preview renders the
**real** `Hero`, so it cannot drift from the site.

The shared `Hero` takes several optional composition props, all defaulting to
the historical behaviour: `align` (`"start"` left-aligns the text and caps its
measure), `subline` (a quieter supporting line under the slogan) and `actions`
(a CTA row). The website wrapper (`components/hero.tsx`) surfaces those plus
`splitSlogan`, which reads the tenant's **first slogan line as the headline and
the rest as the subline** - the hierarchy is a design decision the site makes,
without adding a CMS field for the customer to fill. A split slogan also passes
`hideSublineOnMobile`, so on the `xs` band only the headline is shown: the
subtitle is what pushes the CTA off the fold on a phone. A tenant who typed two
equal lines (no `splitSlogan`) still gets both - that copy is one block, not a
hierarchy we may trim. `sites/cafedealtura` uses
all of it; the default template uses none.

The shared `Hero` also has a `scrim` prop (0-1 flat black over the whole frame),
but **the website wrapper deliberately does not expose it**, so a customer site
cannot add darkening on top of the tenant's overlay. It once did (bdrone,
panorganico and cafedealtura each set a `scrim`), and that was the bug: the CMS
"Hero video configuration" preview renders the shared `Hero` with the tenant's
overlay only and knows nothing of a site's scrim, so any scrim made the live
hero darker than the preview - reading as "the overlay setting is ignored". The
tenant's `hero_overlay_*` is now the single source of hero darkening on the
landing, which is exactly what the preview shows.

- **A video hero is not laid out until its video is actually playing.** The
  shared `Hero` wraps itself in `@repo/ui`'s `HeroReveal`: the hero is rendered
  closed, opens to full height on the player's first `playing` event, and the
  slogan/CTA rise into place behind it. A hero video is a
  poster frame long before it is a video - YouTube paints its thumbnail, then
  its chrome, then the first frame - and a hero laid out through all of that
  flickered through three pictures on every landing.
  ⚠ **A closed hero reserves the whole height it is going to occupy**, the
  `profile` disc's overhang included - not merely the navbar's, which is all it
  used to hold. The landing starts with the hero _because_ the hero is what runs
  under the fixed navbar, so with the hero closed nothing held that height and
  the next band (Featured, About) rode up under the bar with its heading cut
  off; reserving the lot also means the page below **does not move** when the
  hero lands, since the box grows into space that was already there.
  ⚠ **What fills that space while the video buffers is the tenant's own mark**,
  centred in an otherwise invisible box under a slow light sweep and built half
  as big again as the hero draws it, which then glides to wherever the logo
  belongs in this layout - shrinking back to size on the way - as the hero opens.
  A `Spinner` sits under it in the tenant's `--accent`, saying outright what a
  mark under a sweep only implies, and goes the moment the video is ready. It is a
  _copy_ of the hero's logo (the hero's own is inside the box being opened and
  clipped for most of the travel), measured against the real one and swapped for
  it on arrival - which is why the logo has **no fade-in**: it has been on screen
  since the first frame. `Hero` builds that mark, so `layout: "none"` and a
  tenant with no logo simply hold the space.
  ⚠ **The wait is bounded** (4 s) rather than open-ended, and a player error
  opens the hero rather than hiding it: a landing with no headline and no CTA is
  worse than a flicker.
  The **CMS preview passes `revealOnPlay={false}`** - that section is about how
  the logo and text are _composed_ over the video, and the live opening would
  collapse the preview to nothing every time an operator pastes a new URL.
- **`profile` bleeds a logo circle half-way below the video**, so both heroes
  wrap themselves in an extra `Box` and hang the disc off it - the video's own
  box keeps `overflow: hidden`. That wrapper's `marginBottom` reserves the
  overhang; without it the page's first block would sit behind the circle.
  **With `hero_bottom_divider` set, the shared `Hero` lifts that disc** by the
  shape's notch depth at the middle of the edge (`shapeDividerEdgeInset`), because the notch makes the
  edge the disc straddles partly transparent - unlifted, the mark's inner half
  hangs over the hole and looks like it slipped out of the hero. It is derived
  from the two tenant fields, so the CMS preview shows the same lift; don't
  compensate again per-site.
- **The dark overlay over the hero is three tenant fields**, applying to
  both heroes: `hero_overlay_style` (`none` | `full` | `bottom` | `top` |
  `both` | `vignette`), `hero_overlay_opacity` (a whole percent, 0-100 - how
  _dark_ it gets) and `hero_overlay_extent` (a whole percent, 0-100 - how _far_
  the gradient reaches across the frame, a taller/shorter dark band). Their
  defaults (`bottom`, 75, 50) are exactly the gradient both heroes used to
  hard-code, so nothing moved when they landed - `hero_overlay_extent`'s 50 is
  the neutral reach each style is anchored to. `extent` has no effect on `full`
  (a flat tint has no gradient to move), so the CMS hides its slider there. Both
  heroes resolve the three through `heroOverlayBackground(style, opacity, extent)`
  from `@repo/ui/hero` - never re-write the gradient locally, or the item hero
  and the landing hero drift apart. This
  overlay is the **only** darkening on the landing hero; the website wrapper does
  not pass the shared `Hero`'s `scrim` prop (see above), so what the CMS preview
  shows is what ships. Don't reintroduce a per-site scrim to "help legibility" -
  it darkens the live hero invisibly to the preview; raise `hero_overlay_opacity`
  or pick a stronger style instead.
- **The circle paints `var(--page-background, …)`**, which `globals.css`
  resolves per theme from `--page-background-light` / `--page-background-dark`.
  Keep that variable: it is what makes the disc read as a hole through the video
  onto the page, in either theme, without a reload.

## The footer's stock-photo credit

`/seed-site` fills a new site's images from a free stock bank (Pexels, falling
back to Pixabay), and those photos can now go live — both banks license
commercially, so `pnpm publish-site --images` carries them into production
rather than leaving the customer forty uploads to do. The credit that makes that
legal is one line in the footer's bottom bar (`components/footer.tsx`).

- **Gated on `system.stock_image_count`**, a count on the System payload of how
  many records still carry a non-empty `attribution`. It appears when the site
  has at least one bank photo and **disappears by itself** once the customer has
  replaced the last one — the API clears a record's credit whenever a new image
  is uploaded over it. Nothing else on the page knows when that flips, which is
  why it is a payload count rather than something each surface derives.
- ⚠ **The banks' _content_ licences waive attribution; their _API_ terms require
  it.** `/seed-site` pulls through the API, so the credit is owed even though a
  hand-downloaded copy of the same photo would owe nothing. Don't "simplify" it
  away on the strength of the licence page.
- **One footer line, not a chip on every image** — Pexels asks for "a prominent
  link to Pexels", which this satisfies, while a badge on each card would stamp
  forty catalog tiles with text the customer never wrote. The per-image credit
  **is** stored (`attribution` / `attribution_url` on every record, via
  `BasePicture`), so a caption under a detail-page gallery can be added later
  with no migration — this is a rendering decision, not a data one.

## Finding an image in the CMS (the stock-image picker)

**Every CMS image field can be filled from a free stock bank.**
`components/admin/image-web-search.tsx` (`ImageWebSearch`) searches the same
banks `/seed-site` pulls from and sets the record's image from the results — so
an operator who does not like the seeded photo, or who is adding a record by
hand, is not left hunting for a file. It sits under the uploader it fills, and on
the ingredient form it is the third member of the web-search family beside the
nutrition and price searches: a prefilled query, a search, a preview, and nothing
written until the form is saved.

| Piece                           | Where                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| The picker                      | `components/admin/image-web-search.tsx`                           |
| A single-image field's state    | `hooks/use-admin-image-field.ts`                                  |
| Uploader + picker, as one field | `components/admin/admin-image-field.tsx`                          |
| The payload fragments           | `lib/admin-api.ts` (`stockImageFields`, `createStockGalleryRows`) |

Which forms carry one, and in which of its two shapes:

| Shape                        | Forms                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Single** (a pick replaces) | ingredient, the three catalog categories, the Main Image of a product / service / menu item, highlight, story/event cover |
| **Gallery** (picks append)   | product, service, menu item (10 slots); success story, event (20)                                                         |

⚠ **All three catalog forms carry _both_ shapes, and the Main Image is not the
gallery's first row.** `Product.image` / `Service.image` / `MenuItem.image` is
its own stored file, and the API's `_buyable_image_url` reads it **first**,
falling back to the first gallery row only when it is empty — while every detail
page's gallery builder does the opposite (gallery first, `image` as the
fallback). So a record whose gallery is replaced but whose main image is left
alone shows the **new** photos on its detail page and the **old** one on every
catalog card, in the OG/share tags, on its variant thumbnails and in the cart's
recommendation strip. Product and menu item had no Main Image control at all
until this landed, which made a `/seed-site` photo unreachable from the CMS
entirely: the form only listed the gallery rows, so the picture the cards were
drawing was never on screen. Don't remove the field from a catalog form on the
grounds that "the gallery already has one".

- **Both calls go through website-api** (`searchStockImages` / `fetchStockImage`
  in `lib/admin-api.ts` → `/api/stock-images/*`, allowlisted in the admin proxy).
  This app holds no bank credential, the same split the LLM and Stripe calls
  make. The API side owns the rules — read website-api's CLAUDE.md → "Stock
  photography and the credit it owes" before changing either half.
- ⚠ **The photo and its credit are saved in one write.** Storing an image clears
  any attribution the record had (a customer's own photo owes nobody), so
  `handleSubmit` sends `image` + `attribution` + `attribution_url` together.
  Splitting them into two saves silently loses the credit, and the credit is what
  makes the photo legal to publish — it is what the footer's line is counted
  from.
- **The browser never fetches the photo.** The grid shows the bank's thumbnails
  and a pick is sent as `{bank, bank_id}`; the API downloads the file and hands
  it back as a base64 data URL, the same shape `AdminImageUploader` produces from
  a file, so the form's existing save path takes it unchanged.
- **The uploader and the picker are one field with two doors, never two
  pending images.** Picking a photo clears any queued upload (and remounts the
  uploader, whose file list is its own state); uploading a file clears the
  picked photo. Whichever was chosen last is the one being asked for.
- **The query is prefilled from the name and then left alone.** It follows the
  name field until the operator types in it, because the better search is often
  not the record's own label ("queso Oaxaca", not "Queso"). A form with two
  pickers (a service, a story, an event) gives both the **same** query — they are
  looking for the same thing, and two boxes to retype would be busywork.
- ⚠ **`slots` is what decides the picker's shape, and it is what the uploader
  has _left_, not the gallery's size.** Undefined is the single-image field; a
  number is a gallery, where picks append and are numbered in the order they will
  be written. `remainingGallerySlots` counts the **deletions** rather than
  trusting the uploader's last reported order — that order is empty until the
  operator touches the control, and "empty because nothing changed" and "empty
  because they removed everything" are different answers. At `0` the picker says
  so rather than letting an operator pick a photo the save would drop.
- **On a gallery the picker and the uploader are peers**, unlike on a single-image
  field: both fill the same slots, picks land _after_ the uploads, and neither
  clears the other. It is only the single-image field where they are two doors to
  one slot.
- **`useAdminImageField` is destructured for the load effect** (`const loadImage
= image.load`). The callback is stable; the object is not — an effect keyed on
  it would re-fetch the record on every pick and keystroke.

## The footer's cradled brandmark

`System.hero_text_frame` ("Framed heading") does one more thing than frame a
hero heading: with a `System.img_brandmark` set, it also cradles that mark on
the **footer's top edge** (`components/footer.tsx`). Both are the same object -
`@repo/ui`'s exported `BrandmarkCradle`, which `HeroTextFrame` hangs its own
disc in - so the two brand moments cannot drift apart.

- **It is on the frame switch on purpose, not a field of its own.** A site
  wearing the frame wears it in both places; one that doesn't keeps the plain
  rule. Both conditions are required - the switch **and** a brandmark - since
  there is nothing to cradle without a mark.
- **The cradle _replaces_ the footer's `border-top`**, so `.footer--cradled`
  removes it: those flanks are the rule. It also positions the footer (the disc
  is absolute) and reserves the overhang with a top margin, or the page's last
  block sits behind the disc.
- **The disc's diameter travels from TS to CSS as `--footer-cradle-badge`**,
  set on the element from `HERO_FRAME_BADGE_SIZE`, so `@repo/ui` stays the one
  place that decides how big a cradled brandmark is - don't re-type the `clamp()`
  into `footer.css`.
- **The colours are the footer's, not the hero's.** The hero draws its cradle in
  white because it sits over a video; here it wears the border's own
  `color-mix(… --foreground 10% …)` and a `var(--page-background, …)` disc, so
  it follows the theme rather than staying white in dark mode.
- **The area between the shoulders is filled with the footer's `--background`**
  (the cradle's `fill`), so the footer swells up to meet the mark instead of the
  page showing through a notch in its edge. That is also what makes the disc
  legible: a `--page-background` circle against a `--background` bump reads as a
  container, where against the bare page it was only a shadow. The hero passes
  no `fill` - its frame floats over a video and has no surface to continue.

## Typography (per-tenant fonts)

A tenant can ship its own typefaces: `System.google_font_url` (one Google Fonts
stylesheet URL, which can carry both families) plus `font_display` (headings)
and `font_body` (body text). The CMS section is
`admin/logos-and-styles/typography-section.tsx`, whose preview loads the **real**
stylesheet so it cannot drift from the site. `/seed-site` sets all three from
the brief.

- **The `<link>` is rendered by the locale layout, not `@import`ed from
  `globals.css`** - the URL is per-tenant, and an `@import` would block on the
  CSS file before the font fetch even starts. The layout publishes the two
  families as `--font-display` / `--font-body`; `globals.css` applies
  `--font-body` to `html, body` and `--font-display` to `h1`-`h6`.
- **Both variables are unset for a tenant with no font**, so the Roboto
  `@import` at the top of `globals.css` remains the platform default and no
  existing site changed appearance when this landed. Don't remove that import
  without checking every tenant.
- **The URL is host-restricted in three places** - the model validator, the
  write serializer, and `isGoogleFontUrl` in `lib/system.ts`. The frontend check
  is not redundant: the value lands in a `<link rel="stylesheet">` on every page
  of a tenant's site, and a row written before the validator existed (or straight
  into the DB) would otherwise pull a stylesheet from an arbitrary origin.
  `cssFontFamily` likewise rejects, rather than escapes, a family name that
  isn't plausibly a family name - it ends up in an inline `style` attribute.

## Detail-page galleries

All five detail routes - product, service, menu item, blog post, highlight -
render `components/item-gallery-client.tsx`, which is now a **thin wrapper over
`@repo/ui`'s `ImageGallery`**, shared with `apps/animals`' three catalog detail
pages. The wrapper owns nothing but this app's `Gallery` message namespace (the
package is i18n-agnostic and takes every string as a prop); the slideshow, the
thumbnail strip, the fullscreen viewer and the frame sizing all live in
`packages/ui/src/core-elements/image-gallery.tsx`, so change them there.

Three things came with the move:

- **Fullscreen pages and zooms.** It is a second Swiper opening on the slide
  that was pressed, not a lightbox over one photo, and it pinches/double-taps to
  zoom with a magnifier in the control row for the mouse. It also locks the page
  behind itself (`useScrollLock`), which the old copy did not.
- ⚠ **`forceOrientation` is gone.** The blog and highlight pages used to pin a
  5:4 frame below `md`; the frame is now always the 4:5/5:4 box derived from the
  most-portrait photo in the set, as on the other three pages. Don't reintroduce
  a per-breakpoint override in one app - it was the last thing keeping the two
  galleries from being one component.
- ⚠ **`public/icons/` must carry all six glyphs the gallery reads** -
  `fullscreen`, `prev`, `next`, `close`, and now `zoom-in`/`zoom-out`, which
  were copied in from `apps/animals` with this change.

## Homepage flyers - promo slides with a band each

A tenant authors any number of **flyers** in `/admin/homepage-flyers`, and the
landing pages through them between the success stories and the highlights. A
flyer is a photograph, a bit of bilingual copy, up to **three** hand-picked
catalog items, and - the part that matters - **its own colour band and edge
shapes**.

| Piece                   | Where                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| The band, server half   | `components/homepage-flyers.tsx`                                  |
| The slider, client half | `components/homepage-flyers-slider.tsx` (+ its `.css`)            |
| Fetcher + type          | `lib/homepage-flyers.ts`                                          |
| The item picker         | `components/admin/catalog-ref-picker.tsx` (shared with Spotlight) |
| The CMS                 | `app/[locale]/admin/homepage-flyers/`, `.../[id]/`                |
| Model, API, cache       | website-api `core/` (`HomepageFlyer`)                             |

- **It is a model rather than more `System.spotlight_*` columns because of the
  band.** Every slide is its own `SectionBand` - `background`,
  `top_divider`, `bottom_divider` are columns on the row - so the section is a
  stack of bands, not one band whose contents change. That is also why the CMS
  page writes **no System field at all**, unlike `/admin/highlights` and
  `/admin/featured-spotlight`, which own their section's band and heading.
- **The per-record band controls are the very same `SectionBandSection`** the two
  System-level bands use, pointed at this row's three columns. It loads
  `background_light` / `background_dark` for the preview's backdrop only and
  **deletes them from the payload on save** - the same rule the other two pages
  follow, so a flyer form can never write back a stale copy of
  /admin/logos-and-styles' work.
- ⚠ **A slide's item cards are `BuyableCard`s - async server components - inside
  a client Swiper.** That works only because the server half resolves each whole
  slide (locale, catalog, the card's own session/cart/hearts) and hands the
  finished node to `HomepageFlyersSlider`, which knows nothing but Swiper. Don't
  "simplify" it by moving `SectionBand` or the cards into the client component;
  the cards cannot follow.
- **One flyer is a section, two are a slider.** `SliderControls` renders nothing
  for a single slide, so a lone flyer carries no dots and no arrows - which is
  what stops it looking like a broken carousel. The band renders nothing at all
  with no flyers, the contract every landing block here follows.
- ⚠ **The slide's layout is grid areas in CSS, and must stay there.** The DOM
  order is header → media → body; below `sm` that reads straight down, from `sm`
  up the photograph moves beside the writing and spans both text rows, on the
  side `image_side` names. Those templates are the one thing that differs across
  the breakpoint, so a `styles` prop - an inline style - would beat every media
  query and pin the layout to one band. A flyer missing its title or its
  photograph drops that area (`--no-header` / `--no-media`): an empty area is
  still a row, and would pay for the grid's `gap` around a hole. **The gap
  itself is in there too**, for the same reason: from `sm` up the title and the
  copy beneath it close into one block (`row-gap: 0`, the heading's own leading
  being the space between them) while the column gap holding the writing off the
  photograph stays - and on a phone the two are not even adjacent, since the
  photograph sits between them.
- **The photograph keeps its own aspect ratio** - `width`/`height` are the
  placeholder ratio that reserves the box, and `height: auto` hands the frame
  back to the file once it loads. No `priority` on any slide, the first included:
  the band is below the hero, so eager-loading it only competes with the real LCP.
- **`items` are `{kind, id}` refs, resolved on the frontend** against the cached
  catalog, exactly like `spotlight_items` - so a picked item that is later
  deleted or unpublished drops out of its slide instead of breaking the section.
  A slide that loses every one of them is still a flyer and still renders. Like
  the spotlight's trio, the ids are per-environment and are picked in each
  environment's CMS.
- **Three slots, one card size, and the third card only exists from `md`.**
  They sit in the copy column, which is half the band from `sm` up, so a trio
  squeezed in there at `sm` shrinks all three past legibility. `size` is a flat
  `{ xs: 6, md: 4 }` - deliberately **not** derived from `items.length`, or a
  slider whose cards changed size from slide to slide would read as three
  different components instead of one row of the same thing. That leaves the
  third card with nowhere to go below `md` (it would wrap under a half-empty
  row), so it carries `hidden={{ xs: true, sm: true }}` and comes back with the
  column wide enough to hold it. ⚠ It is **hidden, not dropped**: which cards a
  slide shows is a breakpoint question and this is a server component with no
  viewport, so slicing the array would pin every band to one answer.
- **The cards run in `BuyableCard`'s `compact` mode**, which squares the
  photograph (1:1 rather than the catalog 4:5), drops the blurb, and centres the
  add button with the share and heart pair gone. At a third of the copy column
  nothing else fits, and the flyer's own copy is already saying what the items
  are. ⚠ It is a **reduction of the one card, not a second card** - the price,
  the badges, the admin shortcut and both links to the item are untouched, so a
  card is recognisably the same object in either mode. The prop threads
  `BuyableCard` → `BuyableCardView` → `BuyableCardActions`; nothing the server
  resolves changes, since a compact card is the same card with less on it.
- **There is no Sort Order field on the flyer form.** The order is dragged on
  `/admin/homepage-flyers`, which is the order the slider reads in; a number
  typed on the form could only be a second way to say the same thing. The column
  still round-trips through the form's `values`, so saving a flyer never moves
  it.
- **`components/admin/catalog-ref-picker.tsx` is the shared picker**, extracted
  from the spotlight section when this became its second consumer (per "Shared
  Constants" below): the per-tenant catalog fetch, the `${kind}:${id}` encoding
  and the compaction of an emptied middle slot live there, and each consumer
  passes only how many slots it has.

## Section background bands (`SectionBand`)

The two full-width colour bands a landing paints behind its Catalog Items and
Company Highlights sections are **one component**,
`components/section-band.tsx`, used by every site (`sites/*/landing.tsx`) —
never a bare `<Box styles={{ width: "100%", background }}>` any more. It carries
the tenant's band background (`System.catalog_items_bg` / `highlights_bg`, still
passed through `fitSectionBackground`) plus the shape cut as a transparent notch
out of the band's **top and bottom** edges (`System.catalog_top_divider` /
`catalog_bottom_divider` and the `highlights_*` pair). The CMS section is
`components/admin/section-band-section.tsx`, which previews the **real**
`SectionBand` over the tenant's own page background, so it cannot drift from the
site. It is rendered **once per band, on the page that owns that section**: the
catalog band on `admin/featured-spotlight` (below the three featured-item
pickers), the highlights band on `admin/highlights` (below the highlight items,
together with the section's heading/subtitle pair). Keep a band on its section's
page — both bands were once on `/admin/system`, nowhere near the items they
frame.

- **Both edges, unlike the hero.** A band has a section above it _and_ one
  below, so each edge is its own setting; `Hero`'s divider stays bottom-only
  because a hero only ever dissolves into the page beneath it. The shape set is
  shared — `components/admin/divider-options.ts` on the frontend,
  `DIVIDER_CHOICES` in `core/models.py` on the API — so a shape added in one
  place is offered everywhere. `brandmark` is excluded from both: it needs a
  same-origin brandmark URL neither the hero nor the bands plumb through.
- **The two edges are nested, not one mask.** A divider masks the element it is
  on _and everything painted inside it_, so `SectionBand` puts the background on
  the innermost box, cuts the bottom notch from that, and cuts the top notch from
  a wrapper around the result. Don't "simplify" it into a single element — a
  second `mask` declaration would replace the first, not add to it.
- **A notch is a real hole**, so the band's `elevation` is `0` (the shared
  `ShapeDivider` defaults to 24, which is the hero lifting off the page) and
  anything that must escape the band has to live outside it.

## The brand accent as ink (`--accent-text`)

`--accent` in this app is **one tenant hex published for both themes**
(`[locale]/layout.tsx`, from `System.primary_color`), where the `@repo/ui`
palettes it overrides ship a _different_ accent per theme (`#06b6d4` light /
`#22d3ee` dark) precisely so the colour stays readable. Painted as text that
single hex is legible in one theme only: La Cocina de Rosalinda's `#1B2A6B`
reads at 10.5:1 on a light card and **1.2:1 on a dark one**, and a brand yellow
fails the same way in light mode.

So the layout publishes the brand colour a second time, as ink:

| Variable                                     | What it is                                                  |
| -------------------------------------------- | ----------------------------------------------------------- |
| `--accent`                                   | The tenant's hex, untouched. Every **fill**.                |
| `--accent-text`                              | The theme's readable variant. Every **text and icon**.      |
| `--accent-text-light` / `--accent-text-dark` | The two resolved values; `globals.css` picks one per theme. |

`readableOn` keeps the hue and saturation and walks the lightness toward
whichever end of the scale the theme's surfaces are furthest from, until it
clears **4.5:1** against all of them (the palette's `--background` /
`--surface-1` / `--surface-2` plus the tenant's own page background). `#1B2A6B`
comes out unchanged in light and `#96a5e5` in dark - the same blue, still
recognisably the brand, rather than a white that throws it away.

**It lives in `@repo/ui`** (`core-elements/contrast`), not here: the same
problem exists in every app that hands `PaletteProvider` an `accent`, and every
core element that paints the accent as ink now reads `--accent-text` with
`var(--accent)` as its fallback. `lib/colors.ts` re-exports `readableOn` and
`accentInkVariables` so this app still has one door onto colour arithmetic;
`[locale]/layout.tsx` publishes the pair inline for the first paint **and**
passes the same two page backgrounds to `PaletteProvider` as
`inkSurfaceLight` / `inkSurfaceDark`, so the server-rendered value and the one
the provider rewrites on a theme toggle cannot disagree.

- ⚠ **`--accent-text` is for ink only** - anything drawn _on_ a surface rather
  than being one. A primary Button, a `filled` Badge, a `solid` IconButton, the
  menu rail and the map pin stay on `var(--accent)`: there the brand hex is the
  _surface_, and its own foreground answers for the contrast. Adjusting those
  would repaint the tenant's brand rather than make it readable. A `subtle` or
  `outlined` Badge **is** ink - `badge.css` paints its `color` prop as the text -
  so those take `--accent-text`.
- ⚠ **A thin mark on the page is ink too, even when it is not text**, and this is
  the half that was missed when `--accent-text` first landed. Rosalinda's
  `#1B2A6B` sits at **1.05:1** on `--surface-1` in dark mode, so everything the
  brand hex was painting that was not a filled surface simply stopped being
  visible: the cart line's edit `IconButton`, the navbar's Favorites and Account
  glyphs, its dropdown chevron, and the underline marking the current page. All
  of them now follow `--accent-text` (`#96a5e5` here, 5.3-8.3:1), which is the
  same blue rather than a white that throws the brand away. The fixes are in
  `@repo/ui`, not here - `Icon`'s default colour, `IconButton`'s `KIND_ICON_COLORS`
  / `KIND_BACKGROUNDS` / `KIND_BORDERS` plus the `--icon-button-fill` hover wash,
  and `.ui-navbar-item--active::after`.
- ⚠ **A border belongs to whichever of the two it is doing.** The rim around a
  filled surface is part of that fill and keeps `--accent`; a hairline outline
  drawn on the page to give a **ghost** control its shape is ink, and so is the
  low-opacity tint inside it - a 16% wash of a brand navy over a dark page is
  indistinguishable from the page, which is what left that edit button with no
  discoverable shape at all.
- **It is resolved per theme in CSS, never inline.** Both values are published
  as variables on `<body>` and `globals.css` picks one per `[data-theme]`,
  exactly as `--page-background-light` / `-dark` do - an inline resolved colour
  would be whatever the server picked and would go stale the moment the visitor
  toggles the theme. `PaletteProvider` rewrites the palette vars on `body` on
  every toggle and leaves these two alone.
- ⚠ **A chip that is always white takes `--accent-text-light` explicitly**, not
  `--accent-text` - the navbar's cart count is accent-on-white in both themes, so
  the dark variant (lightened for a dark surface) would be the wrong half.
- **Nothing is published when `primary_color` isn't a six-digit hex**, and every
  consumer's `var(--accent)` fallback stands.
- `--secondary` has no ink variant, deliberately: it is fill-only today (the
  menu category indexes light the current section with it, over
  `--secondary-foreground`). Add one the same way if it ever becomes text.

## Logo watermark & page background

The tenant's logo can be tiled faintly behind every **public** page
(`components/logo-watermark.tsx`, rendered by the locale layout inside
`<HideOnAdmin>` when `System.watermark_enabled`). The tenant tunes rotation,
size, spacing and opacity - plus the light/dark page background - in the CMS's
"Watermark & Background" section
(`admin/logos-and-styles/watermark-section.tsx`), whose preview renders the
**same** component so it cannot drift from the site.

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
| `.item-points-price`    | The points price beside a detail page's money price - the price's weight, in `--accent-text`                  |
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

## Two-column media/text layouts - split at `sm`, not `md`

**A section that pairs a media column (image, gallery) with a text column must go
two-up from the `sm` breakpoint, not `md`.** Any new view, page, or section that
lays out "image/gallery on one side, copy on the other" should use `Grid`
`size={{ xs: 12, sm: 6 }}` - full width only on the smallest (`xs`) phones, two
columns from `sm` (tablets) up. Don't default such a split to `md: 6`; it wastes
the tablet band by stacking content that comfortably fits side by side.

- The rule applies to the whole pairing, including any **sibling card pair** in
  the same section (e.g. an About page's mission/vision cards) - keep the
  breakpoint consistent so the section doesn't reflow at two different widths.
- Established users of this shape (**follow them for new pages**): the blog inner
  page (`app/[locale]/blog/[slug]/page.tsx`), the highlights inner page
  (`app/[locale]/highlights/[slug]/page.tsx`), the shared landing block
  (`components/about-intro.tsx`), and the per-site `/about` pages
  (`sites/*/pages/about.tsx`) - all use `sm: 6`.
- **Prefer the `Grid` `size` prop over a CSS `@media` query** for the split (it's
  the props-first rule, and `Grid` reads the same `BREAKPOINTS` scale). When a
  description column should span full width if its media sibling is absent, keep
  the conditional on the same breakpoint:
  `size={{ xs: 12, sm: hasMedia ? 6 : 12 }}`.
- **An asymmetric main-content + sidebar split (a wide primary column beside a
  narrower summary/aside) uses `sm: 7` / `sm: 5`, not `md: 8` / `md: 4`.** Same
  reasoning as the even split: at `md` the sidebar drops below the content on the
  whole tablet band, wasting the width; `sm: 7` / `sm: 5` keeps the primary column
  dominant while the aside stays comfortably readable from `sm` up. Established
  users (**follow them**): the order detail page (`app/[locale]/orders/[id]/page.tsx`)
  and both carts (`app/[locale]/cart/page.tsx`, `cart/guest-cart-view.tsx`).
- Only drop to `md: 6` when the two columns genuinely can't share a tablet width
  (very wide fixed content, a table that would overflow) - and say why in a
  comment, since `sm` is the default this repo now expects.

## Responsive breakpoints in CSS (`@custom-media`)

**Never hardcode a breakpoint pixel value in a `@media` query in this app.** The
scale lives once in `@repo/ui`'s `BREAKPOINTS` (`packages/ui/src/core-elements/breakpoints.ts`

- a deliberately React-free module so build scripts can import it), and CSS
  consumes it through PostCSS `@custom-media` tokens.

- The tokens are generated **once, in `@repo/ui`** (not per-app):
  `packages/ui/scripts/gen-breakpoints-css.ts` reads `BREAKPOINTS` and writes
  `packages/ui/src/core-elements/breakpoints.generated.css` (committed; **never edit
  by hand**). This app's `predev`/`prebuild` delegates to it via `pnpm gen:breakpoints`
  (an alias for `pnpm --filter @repo/ui gen:breakpoints`), so a changed scale flows into
  CSS automatically. Regenerate and re-commit that file if you touch `BREAKPOINTS`.
- `postcss.config.mjs` wires two plugins: `@csstools/postcss-global-data` - pointed at
  `../../packages/ui/src/core-elements/breakpoints.generated.css` - injects those shared
  `@custom-media` rules into every CSS file (including CSS from `@repo/ui`), then
  `postcss-custom-media` resolves them. Defining this config opts the app out of Next's
  built-in PostCSS, so `autoprefixer` is listed explicitly - keep it.
- In any `.css` file, write the token, not the pixels:

  ```css
  @media (--below-sm) { … }   /* below the sm breakpoint (mobile only) */
  @media (--md)       { … }   /* from md up */
  @media (--only-lg)  { … }   /* within the lg band only */
  ```

  Available tokens (generated): `--sm`/`--md`/`--lg`/`--xl` (min-width, "from X
  up"), `--below-sm`…`--below-xl` (max-width, "under X"), and `--only-xs`…`--only-xl`
  (single band). Verified under both dev (Turbopack) and `next build --webpack` -
  both read the same `postcss.config.mjs`.

For `@repo/ui` **components** (`Grid`, etc.), still prefer props over CSS - e.g.
`Grid`'s `hidden={{ xs: true }}` hides at a breakpoint with no media query at all.
`@custom-media` is for the CSS that genuinely needs a media query.

## Shared Constants - Don't Duplicate Across Sibling Files

Before defining a constant, type, or pure utility function in a component file, check whether it already exists in a shared file in the same directory. If the same value appears (or is about to appear) in two or more sibling files, extract it into a dedicated shared module in their common parent directory.

**Current shared files to check first:**

| File                                                       | Contents                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/website/components/admin/paragraph-options.ts`       | `PARAGRAPH_WORD_COUNTS`, `PARAGRAPH_LENGTH_STEPS`, `PARAGRAPH_COUNT_STEPS` - used by `admin-form.tsx` and `ai-interviewer/ai-interviewer.tsx`                                                                                                                                                                                                                             |
| `apps/website/components/admin/logo-background-options.ts` | `LOGO_BACKGROUND_SHAPES`, `LOGO_BACKGROUND_LABEL_KEY`, `SCALE_STEPS` - the badge shapes and size stops, used by `admin/logos-and-styles/hero-video-section.tsx` and `admin/social-posts/[id]/page.tsx`                                                                                                                                                                    |
| `apps/website/components/admin/divider-options.ts`         | `DIVIDER_OPTIONS`, `DIVIDER_LABEL_KEY`, `toDividerOption`, `DividerOption` - the shape-divider shapes every CMS divider picker offers (the hero's bottom edge, both section bands' top/bottom edges), used by `admin/logos-and-styles/hero-video-section.tsx` and `components/admin/section-band-section.tsx`                                                             |
| `apps/website/components/admin/catalog-option-label.ts`    | `CATALOG_KIND_ICON`, `catalogRowCategory`, `catalogOptionLabel` - how a catalog record reads in a CMS `<select>`: family glyph, then the **category** it is filed under (the family label only standing in when it has none), then its name. Used by `coupon-scope-picker.tsx`, `catalog-ref-picker.tsx` and `admin/social-posts/[id]/page.tsx`                           |
| `apps/website/components/admin/bilingual-name-fields.tsx`  | `BilingualNameFields` - one short ES/EN name pair with a per-field AI translate button (its own `useLlmProxy`, the shared `buildTranslateMessages` prompts). Used by a reward tier's name and a menu ingredient's choice-group label; extracted from `menu-ingredients-editor.tsx`, which carried its own copy of the prompts because `group_en_name` has no `en_` prefix |
| `apps/website/components/menu-customizer-spacing.ts`       | `MENU_CUSTOMIZER_GAP` - the space between the size choice and the add-ons, on all three surfaces that customise a dish (detail page, card/cart modal, POS till)                                                                                                                                                                                                           |
| `apps/website/lib/maps.ts`                                 | `directionsHref` - the Google Maps hand-off, built from **coordinates, never an address**. Used by the contact page's locations, an event's venue and an order's location; website-api builds the same URL for the order email                                                                                                                                            |
| `apps/website/lib/same-origin-image.ts`                    | `toSameOriginDataUrl` - routes a remote image through `/api/media` (this app's own passthrough proxy) so a canvas that draws it is not tainted. Used by both flyer exports and by `lib/map-capture.ts`                                                                                                                                                                    |
| `apps/website/lib/contact.ts`                              | `whatsappHref` - the wa.me click-to-chat URL, with the number stripped to digits (wa.me rejects the spaces and dashes people type) and an optional prefilled message. Used both directions: a **branch's** number on the contact page, a **customer's** in the admin inbox                                                                                                |

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

`GROQ_API_KEY` in `website-secrets` is **obsolete**, twice over - LLM calls moved
to website-api, and website-api has since dropped Groq for OpenRouter, so nothing
in the monorepo reads a Groq key at all. Drop it (`pnpm secrets` cannot delete
keys; that needs a manual `kubectl patch` with a null value) and revoke the key at
the Groq console.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

**Keep this block, including in commits.** It is part of the project's agent setup, maintained by `next dev` for every agent that works here. If it appears as an uncommitted change, that is intentional — commit it as-is. Do not remove it to clean up a diff; it will be regenerated.

<!-- END:nextjs-agent-rules -->
