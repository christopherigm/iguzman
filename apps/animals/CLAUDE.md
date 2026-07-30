# animals - App-Specific Conventions

A public nature field journal, **plus its own CMS at `/admin`**. Read
`apps/CLAUDE.md` first for the Next.js conventions every app here follows; this
file covers only what is specific, and why.

## The public catalog pages

Three detail routes and one **branch** page sit under the landing, and the
landing's `CategoryNav` tiles, gallery captions and journal slider link into them:

| Route                            | Renders                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `/[locale]/[kind]`               | One of the five branches: hero, its categories, its recent sightings, its map    |
| `/[locale]/categories/[slug]`    | One category: hero, first row, its recent sightings, its species grid            |
| `/[locale]/species/[slug]`       | One species: hero, first row, `video_link`, its sightings                        |
| `/[locale]/sightings/[slug]`     | One journal entry: hero, first row, its clips, its map, more of the same species |
| `/[locale]/contribute/species`   | The public staged form that **proposes** a species (`?category=<slug>`)          |
| `/[locale]/contribute/sightings` | The public staged form that **files** a journal entry (`?species=<slug>`)        |

All four are composed from `components/catalog/` (`DetailHero`, `FactsCard`,
`DetailGallery`, `SpeciesGrid`) and `components/journal/sightings-section.tsx`, so
they stay one design rather than four.

**Four pages carry a map**, and all four render the same one -
`components/journal/sightings-map-section.tsx`, the server half, which resolves
every bilingual pair, href and date and hands them to the `SightingsMap` client
component (the same split `SightingsSection` uses for the slider, and for the
same reason). What differs is only the pin set: the landing pins the latest ten
of _each_ category, a branch pins every located sighting in it, a category pins
every located sighting of it, and a sighting pins **itself** - one marker, no
filters.

**"First row" is literally the same row on all three**: the description and the
`FactsCard` as two stacked cards in one column, the record's photographs beside
them as a `DetailGallery` slideshow. It splits at `sm` (`size={{ xs: 12, sm: 6 }}`,
see `apps/CLAUDE.md`), and below `sm` the _text_ column carries
`reorder={{ xs: 'last' }}` so the photographs lead once the two stack - a reader
on a phone meets the subject before reading about it. A record with no
photographs at all gets no second column: the text column widens to `sm: 12`
rather than leaving a placeholder square beside it.

`SightingsSection`'s slider is a _summary_ and carries two ways out of each card:
the category badge opens the branch, and the "See detail" button opens the entry.
Both hrefs are built in `sightings-section.tsx` - the server component that knows
the locale - never in the client slider.

Twelve things that will bite:

- ⚠ **A branch is an enum value, not a record - so `/[locale]/[kind]` owns
  nothing and derives everything.** `KIND_CHOICES` is deliberately not a table
  (animals-api's `catalog/models.py` says why), so there is no row to fetch for
  a branch and nothing an author can upload to one. The title comes from
  next-intl's `Kinds` namespace, the chips are counted from the categories on
  screen, and the hero photograph is **borrowed** from one of them - a featured
  category with an image, else the first with one (`heroCategory` in the page).
  An author therefore chooses that photograph by featuring or ordering a
  category, which is the trade for not adding the table. The hero deliberately
  passes **no `icon`**: a category's glyph shown there would read as the
  branch's own mark. Two more consequences. The URL segment is English and
  plural (`/es/animals`, not `/es/animales`) because a slug is a stable key
  here, and `KIND_SLUGS` / `kindFromSlug` in `lib/catalog.ts` are the one place
  that mapping lives - `fungus` → `fungi`, `weather` → `weather`. And `[kind]`
  is a **top-level dynamic segment**, so it also catches every path under a
  locale that no static route claimed: Next matches `categories`, `species`,
  `sightings`, `admin`, `account` and the auth group first, and `kindFromSlug`
  answering `null` is what turns the rest back into a 404. Adding a static route
  under `app/[locale]/` still wins over it, with no edit here.
  The way in is the navbar's **Catalog dropdown** (and a category's eyebrow,
  breadcrumb and facts row, which all link their branch). The dropdown is built
  in `layout.tsx` from `KINDS` rather than from a fetch - the five are fixed in
  the schema, so the navbar on _every_ page in the app must not wait on, or fail
  with, an API call - and its items carry **locale-less hrefs** like `/account`
  and `/admin`: `Navbar` strips the locale before matching an item as active, so
  a prefixed href would never light up, and the intl proxy redirects `/animals`
  to the reader's own locale on the way through.
- ⚠ **Every public map is one component now, and there is no Google left.** All
  four - the landing's, a branch's, a category's, and a **single sighting's** -
  go through `SightingsMap` (`components/journal/sightings-map.tsx`), a thin
  wrapper (the filter row, the card a pin opens) around `@repo/ui`'s **`OsmMap`**:
  OpenStreetMap raster tiles painted into the page's own DOM, one marker per
  entry, each wearing that entry's **species icon** (its category's as the
  fallback). The keyless Google embed a sighting page used to carry is gone, and
  could not have stayed: it is a cross-origin iframe, so nothing on the page can
  draw over it or read a click inside it - which means it could show a pin but
  never _that_ pin. `OsmMap` shares its Web Mercator with the CMS's `MapPicker`
  through `@repo/ui/core-elements/mercator` - one projection, so a pin cannot
  land a pixel off the tile beneath it in one of them - and its whole surface
  (tiles, pins, zoom control, credit, gesture scrim) through
  `@repo/ui/core-elements/osm-map-chrome`, so the two also _look_ the same.
  Three consequences: the
  **public** site makes third-party requests to `tile.openstreetmap.org` from the
  visitor's browser; the map's **filters narrow the pins that were loaded and
  never re-query**, so a species dropdown shows that species _among these pins_,
  not its full history; and markers sharing a coordinate are **fanned out in
  screen pixels**, because an entry with no coordinates of its own inherits its
  location's centre and a season at one pond would otherwise stack into what
  looks like a single sighting.
- ⚠ **A public map pins the reader only when they press the button - no page
  here asks for the geolocation permission on its own any more.** `SightingsMap`
  passes `locateControl` and `fullscreenControl` to `OsmMap`, **both on by
  default** (a field journal is read with "is any of this near me?" in mind, and
  a pin over the next valley means something the same pin over a country does
  not), so all four public maps carry a two-button row in the **top-right**
  corner: locate, then fullscreen - and in fullscreen the same row is locate,
  then close. Four things follow. The permission dialog now costs a **click**,
  which is the change: it used to appear on any page carrying a map, in front of
  a reader who had done nothing but scroll onto it. A press **does** centre the
  camera on the reader (the initial framing is still `markers`' alone, or a
  reader three countries away would pull the map out to a continent); a refusal,
  a device with no fix, and an insecure origin are all the **same** path - no
  pin, no message, the map exactly as it was - so never write a branch that
  reports the failure. Fullscreen is a **CSS overlay**, not the Fullscreen API,
  because `requestFullscreen` is still dead on iPhone Safari; `Escape` closes an
  open marker card first and leaves fullscreen on the next press. And the **CMS's
  `MapPicker` is unchanged**: it still draws its own hollow twin automatically,
  because an author standing at the spot they are filing _is_ the reason that map
  is on the form. It is likewise inert - no `PIN_CLASS`, no pointer, never writes
  the form; the coordinate that gets stored is still only the one the author
  clicks.
- **A sighting's own map costs no extra request.** `sightingMapPin()`
  (`lib/journal.ts`) turns the entry the page already fetched into the one pin it
  draws, because animals-api publishes `species_icon`, `category_icon` and
  `category_color` on the **detail** payload as well as on the map endpoint,
  precisely so a single pin never has to re-read a list of hundreds to dress
  itself. The section is rendered with `filters={[]}` - every dropdown over one
  entry is a no-op - and with `maxFitZoom` backed off to 12 when the coordinates
  are approximate, since a single pin frames at whatever ceiling it is given.
- ⚠ **No map here takes a bare wheel, on purpose.** A map that
  swallows every wheel event traps a reader scrolling past it - the page stops
  and the map zooms out to the Atlantic instead. Zooming needs `Ctrl`/`⌘` +
  wheel (the same event a **trackpad pinch** produces, so both work through one
  branch), a two-finger pinch on a touchscreen, the `+`/`-` buttons, or the
  keyboard; a bare wheel raises a scrim saying so and lets the page scroll. Don't
  "fix" it back to plain wheel zoom. The tiles are also **colour-graded** by a
  CSS filter on their own layer (`.ui-osm-map__tiles`), light and dark, because
  OSM's cartography is far louder than the rest of the page - the tiles
  themselves cannot be restyled, they arrive as finished PNGs. Both behaviours
  live in `@repo/ui`'s `OsmMap` now, so a change there reaches `apps/website`
  too. **The CMS's `MapPicker` strikes the same bargain**, in its own copy of the
  wheel handler (`mapZoomHint` / `mapZoomHintMac`): it sits partway down a form
  that is taller than the screen, and it used to snag an author scrolling past it
  exactly the way the public map snagged a reader.
- **A category's slideshow is its own photos _and then_ its species'.**
  `Category` owns a real gallery now (`CategoryImage`), and `toGalleryImages`
  puts those first - they are the shots an author chose for the group - then
  appends the union of its species' photos (each cover, then that species'
  `SpeciesImage` rows), which makes it a contact sheet of the whole branch. It is
  built from the species list the page already fetched, so it costs no extra
  request. **A species page's gallery is only its own rows**, and a sighting's
  only its own `media`.
- ⚠ **All three `toGalleryImages` helpers dedupe by URL through a `seen` set, and
  they have to.** Every record's photos live in a gallery whose _first row_ the
  API publishes as `image` (animals-api's CLAUDE.md → "The first photo is the
  record's cover"), so the cover is normally also one of the rows being iterated.
  The **cover is deliberately kept** and leads the strip - this is a numbered
  slideshow with its own thumbnails, where the cover is simply slide 1, not the
  contact sheet under a hero that these pages used to carry (that one _dropped_
  the cover, because repeating it read as a duplicate). Without the `seen` set it
  would appear twice in a row instead. A cover uploaded separately in the Django
  admin matches nothing and simply leads the strip on its own.
- **A sighting's gallery is one table with a `kind`, so the page splits it.**
  `SightingMedia` holds photos, uploaded clips and video links in one ordered
  list (they share a `sort_order` an author arranges). The page sends the photos
  to the first row's `DetailGallery` and the two video kinds to its own
  `SightingVideos` below it, both keyed off the API's already-resolved
  `source_url`.
- **A sighting's map pin is not always exact.** `latitude`/`longitude` are the
  _effective_ coordinates - the entry's own, else its location's centre - and the
  API rounds them to ~1 km for **every** caller when the place is flagged
  sensitive. `coordinates_are_approximate` says so; it is a caption, not a gate,
  so don't write a branch that "reveals" the precise pair to an administrator.
- **A detail fetcher does not share the list fetchers' contract.** The list
  helpers swallow every failure and answer `[]`, because a list feeds a section
  that a page survives without. A detail page **is** its subject, so `fetchOne`
  (`lib/catalog.ts`) and `getSighting` (`lib/journal.ts`) answer `null` on a real
  404 and **throw on anything else** - a 500 or a refused connection collapsed
  into `null` would render "no such species" for a record that exists.
  `notFound()` in the three pages is therefore trustworthy; keep it that way if
  you add a fourth detail route.
- **`localized()` still applies, and the fallback is one-way.** A non-Spanish
  locale reads `en_name` and falls back to the bare Spanish column, which is why
  the German page for `Venados` says "Deer" rather than translating it.
- **A decorative initial must pass `as="span"`.** `Typography`'s `variant`
  defaults the rendered _element_ too, so the no-photo fallback letter in a
  species card or a category tile would otherwise emit a bare `<h2>`/`<h4>` into
  the page's heading outline beside the real section headings. `aria-hidden`
  hides it from a screen reader but does not take it out of the document
  structure.

## Public contributions - the FAB, the staged flow, the credit line

A signed-in reader can add to the site without the CMS. A
`FloatingActionButton` (`@repo/ui`) sits on three public pages and opens a staged,
Instagram-shaped form: **a category page proposes a species**, **a species page
and a sighting page file a journal entry**. Everything filed this way lands
**pending review**.

The species and sighting FABs are the same action at two depths - the subject is
what differs, not the form: a species page names it in its own route slug (so the
button needs no guard), a sighting page borrows it from the entry (so the button
is only rendered when `species_slug` is non-null, or it would lead to a
`notFound()`).

| Piece                       | Where                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| The three FABs              | the category, species and sighting pages, after `PageBottomSpacer` |
| The routes                  | `app/[locale]/contribute/{species,sightings}/`                     |
| The wizards (one per route) | `…/species-contribute-form.tsx`, `…/sighting-contribute-form.tsx`  |
| Shared stage chrome         | `components/contribute/` (stage shell, photo picker, review row)   |
| Browser client              | `lib/contribute.ts`                                                |
| Token-attaching proxy       | `app/api/contribute/[...path]/route.ts`                            |

Nine things that will bite:

- ⚠ **Pending means `enabled=false`, and there is no moderation queue.** The API
  creates a contribution disabled and flagged `is_contribution`; publishing it is
  an ordinary `enabled: true` PATCH from the CMS, and it shows up there because
  **every CMS list read already sends `include_disabled=true`**. So a contribution
  is simply an unpublished row in `/admin/species` or `/admin/sightings`. Do not
  add a parallel "submissions" surface without deciding it is worth a second
  place for a reviewer to look.
- ⚠ **Anonymity clears the name; it does not hide it.** `author_anonymous` is the
  contributor's _answer_, and the API stores no `author_name` at all when it is
  set - because these payloads are cached under a key that does **not** vary by
  who is asking (the same reasoning as `Location.hide_precise_location`), so a
  name merely withheld at render time would be filled once by an administrator's
  request and then replayed to everyone. The frontend therefore renders
  `author_name` whenever it is non-empty and never consults the flag.
  `created_by` is the audit trail and is never published in any form.
- **The credit line is one check, not two.** An entry authored in the CMS that
  nobody named and a contribution filed anonymously both arrive with
  `author_name: ""`, which is why `sightings-section.tsx` and the sighting page
  each test that one field. It renders as a **byline under the card's title** (it
  is whose account of the encounter this is, not a recorded condition) and as the
  **last row of the detail page's `FactsCard`**.
- ⚠ **The FAB is shown to everyone, and `/contribute` is deliberately _not_ in
  `proxy.ts`'s `protectedPrefixes`.** That is how a reader discovers the site
  takes contributions at all, so an anonymous press is the expected path - the
  page answers it with `SignInPrompt` rather than a bounce, because
  `createAuthProxy`'s redirect carries no return path and would drop the reader at
  `/auth` with no idea what they were about to do. Nothing is protected by
  rendering the form: the endpoint requires a session, re-derived from the token
  by Django on every call.
- **The subject is a query param and it is required** - `?category=<slug>` and
  `?species=<slug>`. The FAB was pressed on a page that already names it, so a
  picker would be re-asking a settled question and inviting the wrong answer. A
  missing or unknown slug is `notFound()`, not a fallback picker.
- **Each flow is one client component, not a route per stage.** The stages share a
  draft and a stage boundary is not a navigation: stepping back must find stage 1
  as it was left, which routes would only give by putting the draft somewhere it
  can be lost.
- ⚠ **`components/contribute/photo-picker.tsx` downscales, and that is why it is
  not `AdminImageUploader`.** That component base64s the file as picked, which is
  fine for one considered photograph from a machine; a contributor picks four
  camera-roll shots at 4-6 MB, base64 inflates by a third, and the submission
  fails _after_ the upload against Django's 10 MB `DATA_UPLOAD_MAX_MEMORY_SIZE`.
  Every file goes through a canvas at 1600 px first, via `createImageBitmap` with
  `imageOrientation: 'from-image'` - without which every portrait phone photo
  arrives on its side. **Photo 1 is the cover** (the API publishes the first
  gallery row as `image`), so the tiles are numbered and re-ordering has _two_
  controls: the tile is an HTML5 drag source wearing `@repo/ui`'s `MoveHandle`
  (`decorative` - the tile is the source, the handle only says so), and the "use
  as cover" button is the one-tap way to the same result. Keep both. `dragstart`
  never fires for a finger, and this is a phone-first surface - the handle alone
  would leave the choice that actually carries meaning unreachable there.
- **Only the base half of each text pair is written** - `name`, never `en_name`.
  A contributor writes in one language and `localized()` falls back to the base
  column for every locale whose twin is blank, so the entry reads correctly in all
  five. Filling the twin is an authoring job, and the CMS has a translate button.
- **A sighting picks a place; it does not drop a pin.** The API takes either and
  refuses neither, but an entry with no coordinates of its own inherits its
  place's centre, which is the documented normal case and enough for every map the
  site draws. `MapPicker` stays a CMS form control. Consequence: with **no**
  locations catalogued the sighting flow cannot be completed, and stage 1 says so
  rather than disabling Continue silently. The **season** is not asked for either -
  `Sighting.save()` derives it from the date.

All three FABs sit in the default corner, **bottom-right**.

**Not built:** a contributor cannot see their own pending records. The flow
confirms the submission and says it is awaiting review, but there is no "my
contributions" list in `/account` - that needs a `created_by`-filtered endpoint
(the column and its index exist) and a page. Decide before adding.

## Auth - shared via `@repo/auth`

Read `packages/auth/CLAUDE.md` for the session model. Only two things are
specific to this app:

- **`isAdmin` gates the CMS, and it comes from a token claim.** animals-api mints
  `is_admin` (see its `users/serializers.py`) as `UserProfile.is_admin` **or**
  Django's `is_staff`. It only drives what is _rendered_ - `proxy.ts` guards
  `/admin`, `AdminSidebar` re-checks it, and Django re-derives it from the token
  on every call.
- ⚠ **Claims freeze for the life of the refresh token.** An account just granted
  `is_admin` sees no Admin link until it signs in again, or until something calls
  `reissueTokens()`. `app/api/auth/profile/route.ts` already does that after a
  profile edit; `/admin/users` says so in a footnote rather than pretending the
  change is instant.

## The CMS

`app/[locale]/admin/` is the authoring surface: site settings and the brand kit,
the whole catalog, the journal entries, the user list, and backup & restore. It
is a port of `apps/website`'s CMS and deliberately shares its shapes - the
sidebar, the card grid on `/admin`, `AdminForm`, `AdminEntityList` - so the two
read as one system. Where it diverges, it is because this backend is different:

- **No tenant anywhere.** No `system` query param, no `systemId` on a payload, no
  dev site switcher and no tenant-mismatch guard. website needs all of that
  because it serves many customers from one deployment; this app is the one site
  it edits.
- **`EntityListPage` is one component, not one file per entity.** animals-api's
  `core/views.py` gives every resource the same endpoints, so the list page can
  be a column list plus a route. The **form** half is deliberately not shared: a
  species form has a category picker and a gallery, a sighting form has five
  relations and a date, a season form has a month picker - those differences are
  the whole content of each page.
- **`lib/admin-api.ts` builds its CRUD calls from a `resource()` factory** for
  the same reason. website spells out five near-identical functions per model;
  there is nothing to gain from doing that against a uniform API.
- **No clone.** animals-api has no clone endpoint, so `AdminForm`'s clone dialog
  was removed on the way in rather than left as unreachable code.

Seven rules that will bite:

- **Every list read sends `?include_disabled=true`.** The CMS is where an author
  finds the draft they have not published yet. The API ignores the param for
  anyone who is not an administrator, so it cannot leak - but it does mean the
  list you see here is not the list the public site sees.
- **Photos are the gallery, and the first one is the record's main image.**
  Categories, species, sightings, locations, seasons and weather conditions have
  no single-cover uploader any more: `EntityGalleryField`
  (`components/admin/entity-gallery.tsx`) takes several files at once, and the
  API publishes the first row as that record's `image` (see animals-api's
  CLAUDE.md → "The first photo is the record's cover"). A drag to re-order is
  therefore a **cover change**, not housekeeping - which is why `persist()`
  PATCHes `sort_order` on every surviving row. `icon` stays its own field
  (`PairedImageFields`); it is a 128 px glyph and must never join the gallery, or
  the cover would sometimes be a map pin.
- **The gallery is written on Save - and only the gallery.** `useEntityGallery`
  holds adds, deletes and re-ordering in form state and writes them from the
  form's `handleSubmit`, **after** the parent row exists (a record being created
  has no URL to POST a photo to until then). That is what lets a new record be
  saved with its photos in one go, and what makes abandoning a form leave nothing
  behind. Two things follow: a form that adds a gallery must call
  `gallery.persist(id)` in _both_ branches of its submit, and `persist` bumps a
  reload token afterwards - without it the uploader would still be holding those
  photos as _pending_ and the next Save would upload every one of them again.
- **A sighting's clips still save immediately, one row at a time.**
  `MediaEditor` keeps the video-file and video-link controls on the old
  `GalleryEditor` path, because a video is far past the API's JSON-body limit and
  goes multipart to its own endpoint - a streamed upload has nowhere to wait in
  form state. All three kinds share one `SightingMedia` table, so the editor
  filters `kind !== 'image'` out of its list; the photos are the uploader above.
- **Geography is a catalog, and it is edited where it is used.** A location no
  longer types its region and country as free text: it picks a **county**, and
  the state comes back through that county - and the country through that state
  (see animals-api's CLAUDE.md → "Geography is a catalog"). Both `state` and
  `country` are read-only on a location payload, so the county picker is the only
  geography control on the form - and each of its options names its state, which
  is what tells two counties of the same name apart. `GeographyPanel`
  (`admin/locations/geography-panel.tsx`) adds and deletes all three tables under
  the locations list, because a missing county is discovered _mid-way through
  filing a place_; `/admin/countries`, `/admin/states` and `/admin/counties` are
  the full lists for a bulk rename. Deleting a country that still has states, or a
  state that still has counties, is a 409, and the panel says so rather than
  reporting a generic failure.
- ⚠ **The panel's tree hides states with no counties behind a per-country
  toggle**, and its state picker labels every option with its country. Both exist
  because `seed_geography` seeds **83 states across two countries** and gives
  counties to only six of them: rendering all 83 buried the handful an author
  actually files against, and a bare "Durango" cannot say whether it means the one
  in Mexico or the one in Colorado. Don't "simplify" either back to a flat list.
- **The map picker is OpenStreetMap, and it cannot be Google.**
  `MapPicker` (`components/admin/map-picker.tsx`) sits above the Latitude field
  via `AdminForm`'s `slots` and writes _both_ coordinates at once. **Both** the
  sighting form and the location form mount it: an entry's pin is the exact spot
  and falls back to its location's coordinates, a place's pin is the place
  itself and falls back to its _parent_ place (a trail opens over its park). It draws OSM
  raster tiles into its own DOM through the shared projection
  (`@repo/ui/core-elements/mercator`) - no `leaflet`, no API key, ~200 lines. It
  was never the keyless Google embed the public page used to carry, and could not
  have been: that is a cross-origin iframe, so nothing on the page can ever read
  a click inside it. It is **not** `@repo/ui`'s `OsmMap` either - that one
  _reads_ a set of markers, this one is a form control that writes two fields, so
  the click, the pin-drag, the place search and the render-time camera below are
  its whole content. ⚠ **But everything it _shows_ is `OsmMap`'s**: the tile
  layer, the pin, the "you are here" pin, the zoom control, the credit and the
  gesture scrim all come from `@repo/ui/core-elements/osm-map-chrome`, so the CMS
  map and the public one are one design and a change to the chrome reaches both.
  Don't hand-roll a control or a marker here - the two copies this replaced had
  already drifted into loose zoom pills in the wrong corner and a pin anchored
  half a pin west of the coordinate it was writing. Two consequences. The picker makes **third-party calls straight from the
  author's browser** - `tile.openstreetmap.org` for tiles and
  `nominatim.openstreetmap.org` for the place search, which is why the search
  runs on an explicit submit (Nominatim allows roughly one call a second) and
  why its Enter key is swallowed - an un-prevented Enter inside `AdminForm`'s
  `<form>` would save the record instead. And the camera is **adjusted during
  render**, not in an effect: the parent re-renders on every keystroke anywhere
  in the form, so an effect keyed on an object would re-centre the map - undoing
  the author's panning - each time they typed.
- **Two pages write `System`, and each PATCHes only the keys it owns**
  (`OWNED_FIELDS` in both). `/admin/system` owns the identity and contact half,
  `/admin/logos-and-styles` the brand kit. Move a field between them and move it
  between those two lists in the same edit, or one page will start clobbering the
  other whenever both are open.

### Route handlers - what may and may not go through the proxy

`app/api/admin/[...path]/route.ts` forwards the whole admin surface to Django
through `apiFetch` behind a **prefix allowlist**, so the browser never holds a
token. A new admin endpoint under a new top-level prefix needs a line in
`ALLOWED_PREFIXES`.

**Three things deliberately do not go through it**, because it re-encodes every
body and response as JSON:

| What                  | Why                                                               | Where                                                   |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| Backup download       | JSON re-encoding corrupts a zip                                   | `app/api/backups/[id]/download/` (streamed passthrough) |
| Backup restore        | destroys the multipart boundary                                   | `app/api/backups/restore/` (buffered, see below)        |
| Sighting video upload | same, and it is far past the API's 10 MB JSON-body limit          | posted straight to Django from `lib/admin-api.ts`       |
| AI streaming          | `res.json()` would turn the live preview into one lump at the end | `app/api/ai/chat/` (pipes `res.body`)                   |

⚠ **The restore upload is buffered, not streamed, on purpose.** `apiFetch` retries
once on a 401 and a `ReadableStream` body cannot be replayed - streaming would
turn every expired-token restore into an unexplained failure _after_ the whole
archive had been sent.

## Reads are `no-store` - the only cache is animals-api's

Every `fetch` in `lib/system.ts`, `lib/catalog.ts` and `lib/journal.ts` passes
`{ cache: 'no-store' }`, and none of them may set `next: { revalidate }`. There is
already exactly one cache in front of this API - animals-api's own response cache,
Redis in production - and each Django app's `signals.py` clears its namespace on
every write, so an author's edit is live on the next request.

This app used to carry a `lib/fetch-cache.ts` that returned
`{ next: { revalidate: 300 } }` in production. Next's data cache sits _above_
animals-api's and knows nothing about the write, so it kept replaying the payload
it already had: a primary colour changed in `/admin` took up to five minutes to
appear, on the CMS's own chrome as well as the public site (both hang off the same
`[locale]/layout.tsx`). A browser hard-reload did not help - the cache is
server-side, on disk in `.next/cache/fetch-cache/`, and shared by every visitor
hitting that pod. The helper is gone; don't reintroduce it. See `apps/CLAUDE.md` →
"Caching - cache in Django, never in Next".

`getSystem()` is still wrapped in React's `cache()`, which is a different thing: it
dedupes the repeated asks **within one render** (layout + `generateMetadata` +
`manifest.ts`) and holds nothing between requests.

## The site's branding comes from the API

The locale layout reads `getSystem()` (request-cached) and paints the site from
it: the palette accent, both page backgrounds, the two font families, the
watermark, the navbar logo, and the title/description in `generateMetadata`.
`app/manifest.ts` builds the PWA manifest from the same row.

- **Both page backgrounds ship as CSS variables, never as one resolved colour.**
  `--page-background-light` / `--page-background-dark` go on `<body>` and
  `globals.css` picks one per `[data-theme]`. An inline `background` would be
  whatever the server resolved and would go stale the moment the visitor toggles
  the theme.
- **The font stylesheet is a `<link>` in the layout, not an `@import` in
  `globals.css`.** The URL is per-site, and an `@import` would block on the CSS
  file before the font fetch even starts. Both families are published as
  `--font-display` / `--font-body` and are **unset** until someone fills them in,
  so the Roboto import at the top of `globals.css` remains the default.
- **`isGoogleFontUrl` and `cssFontFamily` (`lib/fonts.ts`) are re-checks, not
  duplication.** The URL lands in a stylesheet link on every page and the family
  name lands in an inline `style` attribute; the API validates both on write, but
  a row written before that validator existed would otherwise reach a public
  page. `cssFontFamily` **rejects** rather than escapes anything that is not
  plausibly a family name.
- **`SYSTEM_FALLBACK` is not an optional payload.** This is on the critical path
  of every page, so a backend that is down must cost the _branding_, not the
  site. Its values match the model's own defaults, so a fresh database and a dead
  one look the same.
- **`HideOnAdmin` keeps the watermark and the footer off `/admin`.** The CMS is a
  working surface; a tiled logo behind a form is noise.

⚠ **`images.loader` is `'custom'` here**, so `/_next/image` does not answer at all
and `images.remotePatterns` is inert - see the note in `next.config.js`. Anything
that needs a _same-origin_ copy of a remote image (a canvas export, a CSS mask)
needs its own route handler in this app. Nothing in the CMS needs one today.

## i18n

Five locales, two stored languages. The API publishes both members of every text
pair raw (`name` + `en_name`) and resolves nothing; `lib/i18n-field.ts` →
`localized()` is the single place the frontend picks. `es` reads the bare field,
every other locale reads the `en_` twin and falls back to the bare field when the
translation is blank.

**The CMS is the exception, and deliberately so**: it edits _both_ halves of every
pair side by side, so it never calls `localized()`. Its own chrome is translated
like everything else - the `Admin` namespace, plus `AdminImageUploader`, `Months`
and `PlaceTypes`. A new admin string needs its key in all five `messages/*.json`
in the same task.

`Kinds`, `Months` and `PlaceTypes` mirror fixed enums on the API
(`KIND_CHOICES`, `PLACE_TYPE_CHOICES`, and the 1-12 month numbers). The API's
`*_display` values are English-only, so the CMS translates them through next-intl
rather than rendering what the payload says.
