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
customization?, quantity}`) - Django re-prices every one of them
  from the catalog before creating a session. Either way: a client that could
  name a price could name its own.
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
  elsewhere (a customization context, the availability request key), and a
  stepper holding its own copy would be a second source of truth.
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
  through `/_next/image` first (`lib/same-origin-image.ts`, shared with the
  social-post flyer export, which needs it for the same reason). A tenant whose
  **custom** tile URL sends no CORS header simply gets no screenshot - the
  coordinates still save and the email still carries its Directions button.
- **The provider's credit is burned into the image.** A still leaves the site
  entirely and has nowhere else to put one; the live maps carry it as
  `OsmAttribution`.
- ⚠ **The captured pin is redrawn by hand to match `osm-map.css`** - a canvas has
  no CSS. Keep the two in step, and remember the pin's **tip**, not its centre,
  is the coordinate.

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

## Customising a dish - one picker, three surfaces

A menu item's add-ons are rendered by **`components/menu-ingredient-picker.tsx`**
and by nothing else. Three places ask the same question of the same data, and
each one is a thin shell around that component:

| Surface          | Shell                                              | Selection lives in          |
| ---------------- | -------------------------------------------------- | --------------------------- |
| Item detail page | `menu-item-customizer.tsx`                         | `MenuCustomizationProvider` |
| Catalog card     | `menu-customize-modal.tsx` (a `ConfirmationModal`) | local state                 |
| POS till         | `pos/_components/pos-customizer-modal.tsx`         | local state                 |

- **The picker is fully controlled and owns no state**, because the detail page's
  nutrition label has to mirror the customer's selection from a different grid
  row - so the selection is lifted into the context there, while the two modals
  keep it locally.
- **The arithmetic is `lib/menu-selection.ts`, shared for the same reason.**
  A dish configured at the counter and the same dish configured on the site must
  never quote different numbers. None of it is authoritative: the server
  re-prices every selection in `price_for_selection`.
- **POS differs only by `size="lg"`**, which grows the hit targets for a finger
  over a counter. Don't fork the markup to change the till's look - the three
  copies this replaced had already drifted (only the detail page showed the
  ingredient's photo and explained the free-portion allowance).
- ⚠ **A food card's add-to-cart icon opens the modal; it does not post the base
  line.** It used to, which silently chose the defaults for a customer who may
  have wanted the dish without onions, and gave no hint the dish was
  configurable at all. A dish with no customer-facing add-ons still adds in one
  click, and the **remove** state is unchanged - a click on a dish already in
  the cart deletes the line, with no modal.
- **`enabledIngredients` lives in `lib/menu-selection.ts`, not beside the detail
  page's components** - the card's customiser is a client component and cannot
  import from a server one. A disabled row is an admin's "not right now" and
  reaches no customer-facing surface. ⚠ The API does **not** filter it: the
  nested `ingredients` on `MenuItemSerializer` carry every row, and
  `price_for_selection` prices a disabled one at its `default_units`.

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

## Media comes from a CDN, not from this pod (`image-loader.ts`)

In production every uploaded file lives in Cloudflare R2 and the API returns an
**absolute** URL on the bucket's hostname. `next.config.js` sets
`images.loader: 'custom'` + `loaderFile: './image-loader.ts'`, and that loader
returns an absolute URL **untouched** so the browser fetches it straight from the
edge. Anything relative (`/public` assets) still goes through `/_next/image` with
the default URL shape, so local images keep their resizing and modern formats.

- **Stored media gets no per-viewport resizing**, by design: website-api already
  caps every upload at its tier (`core/image_sizes.py`, 256–3840 px), so what is
  stored is what is served. Give large images an explicit `sizes` rather than
  reaching for the optimizer.
- **`/_next/image` still exists and two features still depend on it** — the
  social-post flyer export (`html-to-image` taints the canvas on a cross-origin
  fetch) and the hero `logo`-shape CSS mask (a cross-origin mask resolves to an
  _empty_ mask and clips the badge away). Both route a remote URL through the
  optimizer precisely to get a same-origin copy. That keeps working: the route is
  only disabled by `output: 'export'`, not by a custom loader.
- ⚠ **Those two features are gated by `images.remotePatterns`.** The platform
  bucket is covered by the `**.iguzman.com.mx` entry. **A customer that connects
  its own R2 account with its own CDN hostname must have that hostname added to
  `remotePatterns`**, or the flyer export and the logo mask fall back to the
  un-proxied URL for that tenant. It cannot be read from the database —
  `next.config.js` is evaluated at build time and baked into
  `.next/required-server-files.json` for the standalone server. Onboarding a
  customer is already a code change here (`sites/registry.ts`), so this is one
  more line in the same commit.

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
  remote image must be routed through `/_next/image` before it lands in a
  template, or the canvas is tainted and the export fails. This is the same
  same-origin constraint as the hero's `logo`-shape mask and the shape divider's
  `brandmarkUrl`.
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
without adding a CMS field for the customer to fill. `sites/cafedealtura` uses
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

| File                                                       | Contents                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/website/components/admin/paragraph-options.ts`       | `PARAGRAPH_WORD_COUNTS`, `PARAGRAPH_LENGTH_STEPS`, `PARAGRAPH_COUNT_STEPS` - used by `admin-form.tsx` and `ai-interviewer/ai-interviewer.tsx`                                                                                                                                                                 |
| `apps/website/components/admin/logo-background-options.ts` | `LOGO_BACKGROUND_SHAPES`, `LOGO_BACKGROUND_LABEL_KEY`, `SCALE_STEPS` - the badge shapes and size stops, used by `admin/logos-and-styles/hero-video-section.tsx` and `admin/social-posts/[id]/page.tsx`                                                                                                        |
| `apps/website/components/admin/divider-options.ts`         | `DIVIDER_OPTIONS`, `DIVIDER_LABEL_KEY`, `toDividerOption`, `DividerOption` - the shape-divider shapes every CMS divider picker offers (the hero's bottom edge, both section bands' top/bottom edges), used by `admin/logos-and-styles/hero-video-section.tsx` and `components/admin/section-band-section.tsx` |
| `apps/website/lib/maps.ts`                                 | `directionsHref` - the Google Maps hand-off, built from **coordinates, never an address**. Used by the contact page's locations, an event's venue and an order's location; website-api builds the same URL for the order email                                                                          |
| `apps/website/lib/same-origin-image.ts`                    | `toSameOriginDataUrl` - routes a remote image through `/_next/image` so a canvas that draws it is not tainted. Used by the social-post flyer export and by `lib/map-capture.ts`                                                                                                                        |

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

**Keep this block, including in commits.** It is part of the project's agent setup, maintained by `next dev` for every agent that works here. If it appears as an uncommitted change, that is intentional — commit it as-is. Do not remove it to clean up a diff; it will be regenerated.

<!-- END:nextjs-agent-rules -->
