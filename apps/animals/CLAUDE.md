# animals - App-Specific Conventions

A public nature field journal, **plus its own CMS at `/admin`**. Read
`apps/CLAUDE.md` first for the Next.js conventions every app here follows; this
file covers only what is specific, and why.

## The public catalog pages

Three detail routes and one **branch** page sit under the landing, and the
landing's `CategoryNav` tiles, gallery captions and journal slider link into them:

| Route                            | Renders                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `/[locale]/[kind]`               | One of the five branches: hero, its categories, its recent sightings, its map       |
| `/[locale]/categories/[slug]`    | One category: hero, first row, its recent sightings, its species grid               |
| `/[locale]/species/[slug]`       | One species: hero, first row, `video_link`, its sightings                           |
| `/[locale]/sightings/[slug]`     | One journal entry: hero, first row, its clips, its map, more of the same species    |
| `/[locale]/contribute/species`   | The public staged form that **proposes** a species (`?category=<slug>`)             |
| `/[locale]/contribute/sightings` | The public staged form that **files** a journal entry (`?species=` or `?category=`) |
| `/[locale]/contribute/locations` | The public form that **adds a place** (no param - see below)                       |

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
them as a `DetailGallery` slideshow - which is now a **thin wrapper over
`@repo/ui`'s `ImageGallery`**, shared with `apps/website`'s five detail pages, so
the two sites page through a record's photographs identically. All the wrapper
still owns is this app's `Gallery` message namespace (the package is
i18n-agnostic and takes every string as a prop) and the catalog's own `ImageFit`;
the slideshow, the fullscreen Swiper, its zoom and the scroll lock all live in
`packages/ui/src/core-elements/image-gallery.tsx` now, so a change to any of
them belongs there rather than here. It splits at `sm` (`size={{ xs: 12, sm: 6 }}`,
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
  **public** site makes third-party requests to whichever tile host the site is
  configured for - `tile.openstreetmap.org` unless someone has changed it - from
  the visitor's browser; the map's **filters narrow the pins that were loaded and
  never re-query**, so a species dropdown shows that species _among these pins_,
  not its full history; and markers sharing a coordinate are **fanned out in
  screen pixels**, because an entry with no coordinates of its own inherits its
  location's centre and a season at one pond would otherwise stack into what
  looks like a single sighting.
- ⚠ **Which basemap every map draws is one setting, and the credit travels with
  it.** `System.map_style` (authored at `/admin/system` → Maps) picks between
  OSM's standard tiles, three CARTO styles and a `custom` tile URL;
  `lib/basemap.ts` resolves it once in `[locale]/layout.tsx` and
  `BasemapProvider` publishes the result to the whole tree, so the four public
  maps **and** the CMS's `MapPicker` read it with no prop threaded to any of
  them. Four consequences. The **attribution is no longer a message key** - it
  changes with the provider, and an i18n string cannot follow a setting an
  operator edits at runtime, so `Map.attribution` and `Admin.mapAttribution` are
  gone and the credit comes off the resolved basemap (`@repo/ui`'s
  `core-elements/basemaps`, which keeps each URL beside the string that provider
  requires). ⚠ **Nor is the credit's _link_ a constant**: `map_attribution_url`
  is its own column, because most providers require the credit to point back at
  them and the maps used to anchor every credit to openstreetmap.org/copyright
  regardless - so a "© MapTiler" named one party and linked another. Blank is a
  real answer and draws the credit unlinked; don't restore a default href.
  ⚠ **A provider key pasted into `map_tile_url` is public**, and cannot be
  otherwise: the tiles are fetched from the visitor's own browser, and
  `GET /api/system/` is world-readable. Restrict the key by allowed origin at
  the provider rather than treating the column as a secret. And ⚠ **this chooses
  a style, not what the style contains**: these are raster tiles, so buildings,
  roads and labels are painted into each PNG before it arrives and no "hide the
  houses" switch can exist here. The route to a real per-layer choice is
  `custom` pointed at a style authored in the tile provider's own editor with
  the `building` layer deleted, published as a raster endpoint. (A self-hosted
  `tileserver-gl` chart at `packages/charts/tileserver` was the other route and
  is **gone** - strictly more machinery for the same result. What it bought,
  should the quota ever argue for bringing it back: no per-tile billing, and no
  third-party call from the visitor's browser at all.)
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
  record's cover"), so the cover is **always** one of the rows being iterated -
  it is no longer a file of its own that could sit outside the list. The **cover
  is deliberately kept** and leads the strip - this is a numbered slideshow with
  its own thumbnails, where the cover is simply slide 1, not the contact sheet
  under a hero that these pages used to carry (that one _dropped_ the cover,
  because repeating it read as a duplicate). Without the `seen` set it would
  appear twice in a row instead.
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
Instagram-shaped form. Everything filed this way lands **pending review**.

**A place is the third thing that can be contributed, and it has no FAB.** Nobody
sets out to catalogue a pond; they discover they need one halfway through filing a
sighting at it. So it is reached from the add button beside the sighting form's
place field - `/contribute/locations` exists and renders the same form, but it is
the standalone door, not the main way in.

**Filing a sighting is the primary action on all three pages**; proposing a
species is the rarer, more editorial one and appears on the category page only:

| Page       | FAB(s)                                       | Opens                                  |
| ---------- | -------------------------------------------- | -------------------------------------- |
| a species  | Add a sighting                               | `/contribute/sightings?species=<slug>` |
| a sighting | Add a sighting                               | `/contribute/sightings?species=<slug>` |
| a category | Add a sighting **and** Add a species (above) | `…?category=<slug>` for both           |

The species and sighting FABs are the same action at different depths - the
subject is what differs, not the form: a species page names it in its own route
slug (so the button needs no guard), a sighting page borrows it from the entry
(so the button is only rendered when `species_slug` is non-null, or it would lead
to a `notFound()`), and a category page **does not know it at all** - which is
what the `SpeciesPicker` exists for.

| Piece                       | Where                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| The four FABs               | the category (two), species and sighting pages, after the spacers  |
| The routes                  | `app/[locale]/contribute/{species,sightings,locations}/`           |
| The two wizards             | `…/species-contribute-form.tsx`, `…/sighting-contribute-form.tsx`  |
| The place form (one stage)  | `components/contribute/location-contribute-form.tsx`               |
| The species cascade         | `…/sightings/species-picker.tsx`                                   |
| Shared stage chrome         | `components/contribute/` (stage shell, photo picker, review row)   |
| The place-option label      | `lib/place-types.ts` → `placeLabel` (server *and* browser)         |
| Browser client              | `lib/contribute.ts`                                                |
| Token-attaching proxy       | `app/api/contribute/[...path]/route.ts`                            |

Seventeen things that will bite:

- ⚠ **Pending means `enabled=false`, and there is no moderation queue.** The API
  creates a contribution disabled and flagged `is_contribution`; publishing it is
  an ordinary `enabled: true` PATCH from the CMS, and it shows up there because
  **every CMS list read already sends `include_disabled=true`**. So a contribution
  is simply an unpublished row in `/admin/species` or `/admin/sightings`. Do not
  add a parallel "submissions" surface without deciding it is worth a second
  place for a reviewer to look.
- ⚠ **The credit line is not a field anybody types - it is the account's first
  name.** There is no `author_name` column on the API any more; the payload's
  `author_name` is derived from `created_by.first_name` when the entry is read, so
  neither the contribute flow nor the CMS form has an input for it (see
  animals-api's CLAUDE.md → "The credit line"). `author_anonymous` is the whole of
  what a contributor is asked, and the API applies it at render - which is safe
  only because the answer is the same for every caller. The frontend renders
  `author_name` whenever it is non-empty and **never consults the flag**.
- **The credit line is one check, not three.** Anonymity, an entry authored in the
  CMS (nobody filed it), and a contributor whose account has no first name all
  arrive as `author_name: ""`, and all three render as no byline - which is why
  `sightings-section.tsx` and the sighting page each test that one field and
  nothing else. It renders as a **byline under the card's title** (it is whose
  account of the encounter this is, not a recorded condition) and as the **last
  row of the detail page's `FactsCard`**.
- ⚠ **The FAB is shown to everyone, and `/contribute` is deliberately _not_ in
  `proxy.ts`'s `protectedPrefixes`.** That is how a reader discovers the site
  takes contributions at all, so an anonymous press is the expected path - the
  page answers it with `SignInPrompt` rather than a bounce, because
  `createAuthProxy`'s redirect carries no return path and would drop the reader at
  `/auth` with no idea what they were about to do. Nothing is protected by
  rendering the form: the endpoint requires a session, re-derived from the token
  by Django on every call.
- **The species flow's subject is a query param and it is required** -
  `?category=<slug>`. The FAB was pressed on a category page, so a picker would be
  re-asking a settled question and inviting the wrong answer, and there is no
  meaningful "add a species to nowhere". A missing or unknown slug is
  `notFound()`, not a fallback picker.
- ⚠ **The sighting flow's is not, and how much the URL knows is what its page
  branches on.** `?species=<slug>` is still the preferred way in and is still
  exact - the FAB named the animal, and an unknown slug is a **404**. But the
  category page's FAB opens the same flow with `?category=<slug>`, which is a
  _hint_ rather than a subject: it prefills the first two steps of
  `SpeciesPicker`'s branch → category → species cascade and nothing more, so an
  unknown one costs the prefill, not the page. With neither param the picker
  starts from the branch. Three consequences. The picker **narrows, it does not
  fetch**: `getAllSpecies()` is the one read in this app that deliberately asks
  for the whole species table, so changing a branch re-filters an array instead
  of making a request - and the page projects each row down to its id, slug,
  name, branch and category first, so the galleries never cross the wire. It is
  only fetched in the two cases that actually open a picker; `?species=` still
  reads one record. And the page's heading, its breadcrumbs, its sign-in prompt and
  stage 1's own title all have a **second string** for the case where no species
  is named yet (`sightingIntroAny`, `signInSightingAny`,
  `sightingStage1TitleAny`, `sightingStage1DescriptionAny`) - a flow that has not
  been told what was seen must not print a sentence with a hole in it.
- **A species named in the URL and one the picker offers are different types.**
  `SpeciesSubject` (`{id, slug, name}`) is all the form needs to file an entry;
  `SpeciesChoice` adds the branch and category the cascade filters by. Keeping
  them one type would make a catalog row missing either field unfileable even
  from `?species=`, where nothing reads them.
- **Each flow is one client component, not a route per stage.** The stages share a
  draft and a stage boundary is not a navigation: stepping back must find stage 1
  as it was left, which routes would only give by putting the draft somewhere it
  can be lost. It is also why the "add a place" panel below opens **inline**
  rather than navigating to `/contribute/locations`.
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
- **The place picker is a search field, and its option labels are the haystack.**
  It is `@repo/ui`'s `TextInput` with `options` (a combobox) rather than a
  `Select`, because this one list is the whole catalog of places - the only field
  in either flow long enough to scroll past what you are looking for. Each option
  reads `Lake Estes (Lake) - Larimer`: name, kind of place, county. That is not
  decoration - the label is what typing is matched against, so "Larimer" finds a
  pond whose name the contributor has forgotten, and it is what tells this
  catalog's two "El Salto"s apart (the same job the CMS's county picker does by
  naming each option's state). The kind is translated through the `PlaceTypes`
  namespace from `lib/place-types.ts` - the API's `place_type_display` is
  English-only - and a place with neither kind nor county still reads as its bare
  name. ⚠ The label is built by **`placeLabel` in `lib/place-types.ts`, not in the
  page**, and that move is load-bearing rather than tidiness: the page builds
  these on the server, and the *form* has to build one more in the browser - for a
  place added mid-flow - so two copies would make the place someone just created
  read differently from every other option in the same list. The **weather** field
  stays a plain `Select`: fourteen conditions is where a phone's native picker
  beats a dropdown of ours.
- ⚠ **A contributor who cannot find the place adds it, without leaving the form.**
  An `IconButton` (`/icons/add.svg`) sits beside the place picker in stage 1 and
  toggles `LocationContributeForm` open **inline, under the field**; the place it
  creates is added to the picker's options and **selected**. It is not a link to
  `/contribute/locations`, and must not become one: a navigation throws the draft
  away - the stages share one piece of state with nowhere else to live, the same
  argument that makes each flow one component rather than a route per stage. That
  route still exists and renders the same component, as the standalone way in.
  Three consequences. The new place is **pending, and fileable anyway** -
  animals-api's sighting serializer gates on the *species* being enabled and
  deliberately not on the location (see its CLAUDE.md), so both rows land pending
  and a reviewer publishes the pair. The option is held in the form's own state
  and **never re-fetched**, because a pending place is absent from the public list
  the `locations` prop was built from. And `noPlaces` is **no longer a dead end**:
  the add button renders in that branch too, so a site with an empty catalogue can
  now be filled from the flow that needed it.
- **A sighting picks a place; it does not drop a pin.** The API takes either and
  refuses neither, but an entry with no coordinates of its own inherits its
  place's centre, which is the documented normal case and enough for every map the
  site draws. The pin a contributor *does* drop belongs to the **place** they are
  adding, not to the entry - which is why `MapPicker` is now mounted on a public
  page (see the CMS note below; it is no longer a CMS-only control) while the
  sighting form still has no coordinate fields of its own. The **season** is not
  asked for either - `Sighting.save()` derives it from the date.
- **The place form is one stage, and asks six questions.** A name and a map pin
  (both required - a place with no pin is unmappable and a sighting inherits
  nothing from it), a kind of place, an optional county, an optional parent place,
  and optional photographs. It does **not** stage: it is short, and it has to be
  fillable from inside another form, where a wizard nested in a wizard would leave
  a contributor two "Continue" buttons deep with no idea which one files anything.
  It also renders **no confirmation of its own** - the host owns the aftermath, so
  the standalone route wraps it in `LocationContributePanel` for the
  `SubmittedPanel`, and the sighting form just closes the panel. ⚠ Everything an
  administrator owns is absent, including **`hide_precise_location`**, which is
  not merely editorial: it blurs the place's coordinates *and every sighting later
  filed at it*, for every caller.
- ⚠ **`app/[locale]/contribute/loading.tsx` is why the FAB feels instant, and
  deleting it makes every one of these routes feel broken again.** All three are
  dynamic - they read `searchParams` and the session cookie - so Next cannot
  prerender any of them, and a `Link`'s prefetch of a dynamic route reaches only
  as far as the nearest loading boundary. With none, prefetching
  `/contribute/sightings` returned **245 bytes** of route tree: the FAB's
  `prefetch` bought nothing, the whole server render was paid *after* the click,
  and until it landed the old page simply sat there with no sign that the button
  had done anything. The shell takes that to ~79 KB the router can paint the
  instant the FAB is pressed. It lives on the **segment**, not on one route, so
  all three share it.
- ⚠ **Three reads are gated on the session, and the gate has to stay above
  them.** The FAB is shown to everyone (that is the point of it), so a signed-out
  press is an expected path - and both pages used to fetch the species table, the
  places, the weather and the counties before discovering there was only a
  `SignInPrompt` to render. `getSession()` is a cookie read and a JWT decode with
  no I/O, so awaiting it *first* costs nothing and takes the anonymous case from
  four API requests to none. Don't fold it back into the `Promise.all`.
- ⚠ **The counties list is started but never awaited, and must stay that way.**
  It is the heaviest read in the app - `seed_geography` alone puts 244 rows in
  it, each answered with the full location-grade payload - and it feeds **one
  optional field** on a panel that is unmounted until somebody presses "add a
  place". Both pages hand it down as a `Promise`, and `CountyField` inside
  `LocationContributeForm` is the only thing that unwraps it (`use()`), scoped so
  the suspension reaches that field and not the form around it. Awaiting it on
  either page puts the app's slowest request back in front of every contributor,
  for a control most of them never touch. The labels are still built on the
  **server**, in the page's `.then()`, because they are bilingual and need the
  request locale - only the *waiting* moved.

All four FABs sit in the default corner, **bottom-right**. The category page's
two are a **stack**: "Add a sighting" takes the corner in the accent fill at
`size="lg"`, and "Add a species" sits above it in `kind="default"` at `size="md"`.
⚠ The upper one is raised with `styles={{ bottom }}`, not with `offset` - that
prop sets _both_ edges at once, and would push the button sideways as well. It
reads `var(--ui-fab-offset, 20px)` rather than a literal, so the pair still tucks
in together below `sm`, where `.ui-fab` narrows the offset to 16px. The page also
owes the stack a second spacer's worth of clearance (`FAB_STACK_OFFSET`) on top of
`PageBottomSpacer`, or the last row of the species grid sits under the upper FAB.

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

Eight rules that will bite:

- **Every read sends `?include_disabled=true` - the detail reads as well as the
  lists.** The CMS is where an author finds the draft they have not published
  yet. The API ignores the param for anyone who is not an administrator, so it
  cannot leak - but it does mean the list you see here is not the list the public
  site sees. ⚠ The **detail** half is easy to forget and fails in a way that
  reads like a broken record rather than a missing param: for a while only
  `resource().list` sent it, so `/admin/sightings` listed an unpublished entry
  and opening its form answered 404 → "could not load this". `enabled` decides
  who may _see_ a row and nothing else - reading, editing and deleting any record
  in `/admin` must never depend on it. PATCH and DELETE were always fine; they
  look the row up without the filter.
- **A flag an author flips row by row belongs in the table, as a Switch.**
  `AdminEntityList` renders one for `enabled` on every list and for any other
  boolean column marked `toggle` (`is_featured` on `/admin/categories` and
  `/admin/species`), writing that single field through `useToggleField` -
  optimistic, and rolled back when the PATCH rejects, so the switch never claims
  a write the API refused. It is opt-in rather than automatic for every boolean:
  a flag can be derived, or belong to a form that validates it against its
  siblings. ⚠ The read-only tick/cross badge is what the other boolean columns
  still render, and it is not a control - don't leave a flag looking clickable
  without giving the column `toggle`.
- ⚠ **`/admin/species` is the one list read a page at a time, and its search box
  is a _server_ search.** The catalog outgrew one request - a species row costs
  the API two queries of its own (`sighting_count`, `last_seen`) plus its gallery,
  and this page asks for the drafts as well - so `EntityListPage` takes
  `searchable` and reads 50 rows through `species.listPage`, with a "Load more"
  button for the next 50. Four consequences. The box is **not** a filter on the
  rows in the table: every settled keystroke (300 ms) is a request, which is the
  point - a term has to reach the species that is _not_ on screen. It matches
  `name`, `en_name`, `scientific_name` and `family`, because that is what
  animals-api's `search` param matches; narrowing it is a change on that side, not
  here. **Sort mode disappears while a search is active or while the list is
  partial**, and must stay gone: `useReorder` persists each row's `sort_order` as
  its index in the list on screen, which is only the row's real position when the
  loaded rows are the first N of the API's own order - renumbering a search result
  would reorder the public species grid by whatever happened to match. And
  `species.list` (the whole catalog, unpaginated) is still what the **sighting
  form's** species picker uses: that one is a combobox and has nothing to filter
  against until every row is in it.
- **Photos are the gallery, and the first one is the record's main image.**
  `EntityGalleryField` (`components/admin/entity-gallery.tsx`) takes several
  files at once and the API publishes the first row as that record's `image` (see
  animals-api's CLAUDE.md → "The first photo is the record's cover"), so a drag to
  re-order is a **cover change**, not housekeeping - which is why `persist()`
  PATCHes `sort_order` on every surviving row. `icon` is the one single-image
  field still beside it (through `PairedImageFields`), a 128 px glyph that must
  never join the gallery or the cover would sometimes be a map pin.
- ⚠ **The "Main Image" uploader is gone, and must not come back - there is
  nothing left for it to write.** All six forms used to carry one, filling the
  record's own `image` column, which the API honoured *ahead of* the gallery. Two
  places to pick one cover read as a contradiction from the author's chair:
  dragging a photograph to the front of the gallery below simply did nothing,
  with no visible reason why. The uploader was removed,
  `catalog.0012_main_image_into_gallery` / `journal.0008_main_image_into_media`
  promoted every column that had been filled into that record's **first gallery
  row** (so the choice survives as an ordinary photo), and
  `catalog.0013_drop_main_image` / `journal.0009_drop_main_image` then dropped
  the columns outright. Re-adding the field is a schema change now, not a form
  change.
- **So the CMS has exactly one single-image field left: `icon`.**
  `useEntityImages` and `PairedImageFields`
  (`components/admin/entity-images.tsx`) are still generic over a list of them -
  a second (a poster, say) would be one word - but five forms declare only
  `['icon']` and the **sighting form declares none at all**, so it renders no
  header above its gallery. `payload()`'s "omitted means leave it, empty means
  clear it" contract is what those two still exist for.
- **Nothing hedges about the cover any more.** `EntityGalleryField` lost its
  `mainImageSet` prop, `AdminImageUploader` lost `showMainBadge`, and the
  `imagesIntroWithMain` string is gone: the "MAIN" badge on tile 1 and the
  caption below the heading now simply state the rule. The badge is derived from
  `maxImages > 1` instead - it describes *a position in an order*, so a
  single-image field (an icon, a brand-kit logo) does not wear one, which it
  wrongly did while the prop defaulted to `true`.
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
  `GalleryEditor` path - an upload that runs for minutes has nowhere to wait in
  form state. A video now takes two steps (reserve the row, then upload the bytes
  to **this app**; see "Video" below), and the row therefore appears in the list
  before its file exists, in `processing`. All three kinds share one
  `SightingMedia` table, so the editor filters `kind !== 'image'` out of its list;
  the photos are the uploader above.
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
  CMS's sighting form and its location form mount it: an entry's pin is the exact
  spot and falls back to its location's coordinates, a place's pin is the place
  itself and falls back to its _parent_ place (a trail opens over its park). ⚠ It
  is **no longer CMS-only** - the public place form
  (`components/contribute/location-contribute-form.tsx`) mounts it as its *whole*
  coordinate control, since a contributor has a map and a place they were standing
  in rather than a pair of decimals to transcribe. It stays in
  `components/admin/` because that is still where both of its other consumers are;
  what changed is only that its chrome now translates through the `Admin`
  namespace on a **public** page, which works because every namespace is on the
  client provider. It draws OSM
  raster tiles into its own DOM through the shared projection
  (`@repo/ui/core-elements/mercator`) - no `leaflet`, no API key, ~200 lines. It
  was never the keyless Google embed the public page used to carry, and could not
  have been: that is a cross-origin iframe, so nothing on the page can ever read
  a click inside it. It is **not** `@repo/ui`'s `OsmMap` either - that one
  _reads_ a set of markers, this one is a form control that writes two fields, so
  the click, the pin-drag, the place search and the render-time camera below are
  its whole content. ⚠ **But it draws the site's configured basemap**, through
  `useBasemap()` rather than a prop - an author placing a pin has to be looking
  at the map a reader will see it on - and ⚠ **everything it _shows_ is
  `OsmMap`'s**: the tile
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
  plus the two operational sections - video transcoding and **Maps**
  (`map_style` / `map_tile_url` / `map_attribution` / `map_attribution_url`, see
  the basemap note above); `/admin/logos-and-styles` the brand kit. Move a field
  between them and move it
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
| Sighting video upload | the file never goes to Django at all - see "Video" below          | `app/api/video/upload/` (this app transcodes it)        |
| AI streaming          | `res.json()` would turn the live preview into one lump at the end | `app/api/ai/chat/` (pipes `res.body`)                   |

⚠ **The restore upload is buffered, not streamed, on purpose.** `apiFetch` retries
once on a 401 and a `ReadableStream` body cannot be replayed - streaming would
turn every expired-token restore into an unexplained failure _after_ the whole
archive had been sent.

## Video - this app transcodes it, and that is the whole design

**A sighting clip never reaches animals-api.** A source is a camera-roll 4K
recording, a few GB, and three separate things make Django impossible for it:
Cloudflare caps a request to either hostname at ~100 MB, a multi-GB upload would
hold one of three **sync** gunicorn workers for its whole duration, and that
image has neither ffmpeg nor a worker to run one in. So the pipeline lives here.

```
browser ──chunks (≤90 MB, sequential)──▶ this pod ──▶ /scratch/<id>/source.mp4
                                            │
                                            ├─ PATCH animals-api: 'processing'
                                            ├─ ffprobe: enforce the real duration
                                            ├─ ffmpeg: downscale + CRF + AAC + poster
                                            ├─ PUT output (~100 MB) ──▶ R2
                                            ├─ PATCH animals-api: 'ready' + key
                                            └─ rm -rf /scratch/<id>
browser ──polls the sighting payload──▶ animals-api   (status only)
```

| Piece                     | Where                                                    |
| ------------------------- | -------------------------------------------------------- |
| Chunked upload endpoint   | `app/api/video/upload/route.ts`                          |
| Queue, transcode, cleanup | `lib/video-pipeline.ts`                                  |
| Browser uploader          | `lib/video-upload.ts`                                    |
| R2 writes                 | `lib/r2.ts`                                              |
| Encode settings           | `System.video_*`, authored at `/admin/system`            |
| Public "processing" state | `sightings/[slug]/sighting-videos.tsx` + its poll notice |

Eight things that will bite:

- ⚠ **This route is stateful, and the ingress affinity is what makes it work.**
  Chunks are appended to a file on **one pod's** local disk, so every chunk of an
  upload has to reach the replica that answered the first. A second Ingress
  (`helm/templates/upload-ingress.yaml`) applies cookie session affinity to
  `/api/video/upload` alone - scoped to that path so ordinary page traffic keeps
  round-robin balancing. **Raising `replicaCount` without that affinity breaks
  uploads outright**, it does not merely degrade them: replica B answers chunk 2
  with `unknown_upload` and the upload can never complete.
- ⚠ **Chunks go up sequentially, and must.** The handler appends each as it
  arrives rather than staging N parts and concatenating, because concatenating
  needs the whole file's worth of scratch a second time. Parallel chunks arrive
  out of order and are refused. This is a throughput cost accepted on purpose.
- ⚠ **The scratch volume is an `emptyDir` with a `sizeLimit`, and exceeding it
  evicts the pod** - taking the public site down briefly and killing every other
  in-flight transcode, not just the offender. The budget is
  (`MAX_VIDEO_UPLOAD_MB` × `MAX_CONCURRENT_UPLOADS`) + output, which is why
  uploads are admission-capped at all. It is **not** a PVC: the cluster has no
  ReadWriteMany storage class, so a PVC would be node-local and would pin every
  replica to one node - most of the point of scaling out.
- **A pod restart loses the job, by design.** There is no queue that outlives the
  process. The row is left mid-flight and animals-api reports it `failed` once it
  ages past `VIDEO_PROCESSING_TIMEOUT_MINUTES` - a _derived_ sweep, needing no
  scheduler on either side. The contributor re-uploads.
- ⚠ **Authorisation is a signed ticket, not the session.** This pod cannot decide
  who may write a given media row: for a contributor that turns on the sighting's
  `created_by`, which the read payload deliberately does not publish. The reserve
  endpoints have already made that decision under their own permission classes,
  and hand back an HMAC ticket (`VIDEO_HANDLER_TOKEN`, shared with animals-api)
  naming the row. **Both sides refuse when the secret is unset** rather than
  falling open - an empty configured secret must never match an empty supplied
  one.
- ⚠ **`transcodeForWeb` is not `scaleDown`.** The `@repo/helpers` function this
  uses never upscales (`scaleDown` on a 480p source _enlarges_ it, producing a
  bigger file than the original), caps frame rate at 30 - the single largest
  saving on phone footage - and re-encodes audio to AAC rather than copying it.
  `scaleDown` is video-downloader's operation with its own contract; changing its
  defaults would change that app's output.
- **HEVC is offered and defaults off.** `/admin/system` can select it for ~30%
  smaller files, but Firefox and many desktop browsers cannot play HEVC at all,
  so the picker carries a warning that is not decoration. H.264 is the default
  and the safe answer.
- **A processing row is announced, not hidden - and not framed either.**
  `toVideos` in the sighting page used to drop any media row without a
  `source_url`, which made a clip vanish from the page for the minutes it was
  encoding with nothing to say it was coming. It now emits the row with its
  status, and `SightingVideos` lays out only the **ready** clips and counts the
  rest into **one** spinner and one sentence under the heading (`videoProcessing`,
  an ICU plural on that count: "A video is being converted…" / "2 videos are
  being converted…"). It is deliberately not a frame per clip: a row in flight
  has no dimensions yet, so the box would be a guessed 16:9 that jumps to the
  real ratio when the poll lands, and a black video-shaped box that cannot be
  played reads as a broken player rather than as one on its way. The line is
  refreshed by a slow client poll (`video-processing-notice.tsx`) - polling, not
  SSE, because the status already lives on the row and any replica can answer it
  from the database.
- **A `failed` row, on the other hand, is dropped.** `toVideos` filters it out,
  so `SightingVideos` has no failure state at all. There is no file and there
  never will be one: the row is a note to the author (who sees it, with the
  reason, in `/admin/sightings`), not something a reader can act on, and a black
  frame apologising for a video they never knew existed is worse than the entry
  simply not having one. The `SightingPage.videoFailed` message went with it.
- ⚠ **A clip's frame is cut to the clip, not to 16:9 - and a lone portrait one
  stands beside the map.** The pipeline stores the output's `width`/`height`, so
  every frame takes its own aspect ratio, and the page's layout falls out of it
  (`sighting-videos.tsx`): column spans are handed out **in proportion to aspect
  ratio**, which is what makes the clips in a row come out the same height with
  no letterboxing - a portrait beside a landscape lands on 3/9 of the twelve, a
  row of portraits splits evenly into the `sm: 6 / md: 4 / lg: 3` grid. The one
  case that is _a single portrait clip_ is not a section at all: it is cut to the
  map's height and rendered in the map's row through `SightingsMapSection`'s
  `aside` slot, under one heading (`mapAndVideoTitle`), because full width would
  run a 9:16 video a thousand pixels down the page. With no coordinates to map it
  keeps the height and stands alone. Everything stacks full width below `sm`.
  Two consequences: a clip still encoding has **no dimensions yet**, so it is
  laid out as 16:9 and re-laid out by the poll when it turns ready; and **any
  property that changes across that breakpoint has to leave the props**, because
  a prop is an inline style and beats the media query. `flexDirection="column"`
  on the aside row is what that costs when it is missed: the row never became a
  row, and the query's `align-items: flex-start` then shrank the map to a 1 px
  hairline under the video. Both bands of `flex-direction` therefore live in
  `sightings-map-section.css`, and neither the aside nor the map takes a `width`.

**Contributor limits** (`MAX_CONTRIBUTION_VIDEO_SECONDS`, one clip per entry,
five per rolling day) are enforced by animals-api and re-checked against the real
bytes here; the CMS has no duration limit. A contributor's upload failing leaves
a **filed entry with no clip**, not a lost entry - the outing is the thing worth
keeping, which is why the flow reports success and says the clip did not make it.

⚠ **The duration cap is set twice and both copies must carry the same number** -
`MAX_CONTRIBUTION_VIDEO_SECONDS` in animals-api's env (the enforcing copy, in
`journal/serializers.py`) and in **this app's** env, which is what the picker
displays and refuses on before a byte is uploaded. Set this app's lower and you
hide capacity the API would have allowed; set it higher and a contributor uploads
a multi-GB clip only to have the reservation rejected. Both default to 90.

**This app's copy is read on the *server*** - in `contribute/sightings/page.tsx`,
handed to the form as `maxVideoSeconds` and on to `VideoPicker` as `maxSeconds`.
It cannot be read in `lib/contribute.ts` (bundled into client components, so the
lookup resolves to `undefined` in the browser) and it must **not** become a
`NEXT_PUBLIC_` var: those are inlined when the image is built, which would freeze
the limit at whatever the Dockerfile saw and make the Helm value inert.
`DEFAULT_MAX_VIDEO_SECONDS` there is the fallback for an unset env, nothing more.
A new env var read in this app also needs a line in `apps/animals/turbo.json`'s
`passThroughEnv`, or `turbo/no-undeclared-env-vars` fails the zero-warning lint.

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
