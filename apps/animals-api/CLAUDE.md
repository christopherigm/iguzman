# animals-api - Django Conventions

The backend for `apps/animals`, a **nature field journal**: a catalog of what can
be observed (animals, plants, fungi, seasons, weather) plus a dated, located,
illustrated entry for every time something actually was.

It follows `website-api`'s conventions - read that CLAUDE.md for the Caching
Rule, the full-stack coverage rule and the image-size rule, which all apply here
unchanged. This file covers only what is **different**, and the reasons.

## The two differences from website-api

|                  | website-api                                                                 | animals-api                                                                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenancy          | multi-tenant; every model FKs to `System` and every query is scoped by host | **single site.** `core.System` exists but is a **singleton** holding this one site's name and brand kit - no `host`, no host resolution, no `X-Website-Host`, and nothing FKs to it. Fetched only through `System.load()`. Do not turn it back into a tenant. |
| Write permission | `IsSystemAdmin` (a `UserProfile.is_admin` flag)                             | **`IsSiteAdmin`** (`core/permissions.py`) - `UserProfile.is_admin` **or** Django's `is_staff`.                                                                                                                                                                |

⚠ **`is_admin` and `is_staff` are different things, and `core.permissions.is_site_admin`
is the one place that decides.** `is_admin` opens the CMS in `apps/animals` and the
write API; `is_staff` opens the Django admin on this backend and is treated as
implying the first - without that, every account that authored this site before the
flag existed would have lost write access the day it landed. Both are minted as JWT
claims (`users/serializers.py`) because `@repo/auth`'s `Session` reads both, and
claims freeze for the life of the refresh token: an account just granted `is_admin`
must sign in again, or call `POST /api/auth/token/reissue/`, before the CMS appears.

There are now **two** authoring surfaces, and both are real product:

- **`apps/animals`' CMS at `/admin`** is where an author works day to day. It is the
  reason `is_admin` exists - authoring no longer implies a Django login.
- **The Django admin** stays a first-class fallback for an operator. `catalog/admin.py`
  and `journal/admin.py` are still **product surfaces, not debugging aids**: fieldsets,
  `prepopulated_fields`, `autocomplete_fields`, inlines and thumbnails are there so an
  outing is quick to type up. Keep them that way when you add a field. This is also why
  the cache receivers in `signals.py` remain the primary invalidation path - see below.

## Apps

- **`core`** - the abstract picture bases, the shared plumbing, **and** two concrete
  models of its own: `System` (the site-settings singleton) and `SiteBackup` (a stored
  restore point). `image_sizes.py`, `permissions.py`, `serializers.py` (base64 image
  processing + `Base64ImagesMixin`), `system_serializers.py`, `system_views.py`,
  `views.py` (the generic cached views), `backup.py` + `backup_views.py`, `cache.py`,
  `cache_keys.py`, `signals.py`, `fields.py`.
- **`catalog`** - the reference data: `Category`, `Species`, `Season`,
  `WeatherCondition`, `Location`, plus a photo gallery per record
  (`CategoryImage`, `SpeciesImage`, `SeasonImage`, `WeatherConditionImage`,
  `LocationImage`, all from the abstract `GalleryImage` - see "The first photo is
  the record's cover"). Also `Country`, `State` and `County` - see "Geography is a
  catalog".
- **`journal`** - the entries: `Sighting`, `SightingMedia`.
- **`users`** - unchanged from the scaffold (JWT, passkeys, email verification).

## The five branches are an enum, not a table

`catalog.models.KIND_CHOICES` - `animal`, `plant`, `fungus`, `season`, `weather` -
is the site's top level. The chain is:

```
Category(name='Deer', kind='animal')   <- the sub-category an author files under
    ^
    |  FK (PROTECT, required)
Species(name='White-tailed Deer')      <- kind is read through the category
    ^
    |  FK (PROTECT, required)
Sighting(date=..., location=..., media=[...])
```

- **`Species` has no `kind` column, deliberately.** `Species.kind` is a read-only
  property over `category.kind`, and the serializers flatten it onto the payload
  (`species.kind`, `sighting.kind`). A stored copy would be a second source of
  truth that a category edit could silently leave behind. Filter with
  `category__kind=`, never a column on `Species`.
- **Both FKs are `PROTECT`.** Deleting a category that still has species, or a
  species that still has sightings, is refused - the API turns the `ProtectedError`
  into a **409** with a readable message (`core/views.py`). This is on purpose: a
  cascade there would silently delete years of journal entries. `Location`,
  `Season` and `Weather` are `SET_NULL` instead, because a place can be merged
  away without taking the entries filed there with it.

## Bilingual content: `name` is Spanish, `en_name` is English

Every authored text field is a **pair** - `name`/`en_name`,
`description`/`en_description`, `short_description`/`en_short_description` - the
same shape as website-api's `BasePicture`. The bare field is **Spanish**; the
`en_` twin is **English**. `core.models.TRANSLATED_FIELDS` names the three so
serializers, the admin and the AI translate endpoint iterate them instead of
repeating the list.

They live on `BasePicture`, so every picture model gets them for free.
**`Location` is the exception** - it is not a picture model and repeats the three
pairs by hand, which is the one place a new translated field can silently be
missed.

Three rules that are easy to get wrong:

- **The API publishes both members raw and resolves nothing.** There is no
  `?locale=`, and there must not be: these payloads are cached under one key per
  resource, so a locale-resolved variant would be written into that same key and
  then served to the next reader in the wrong language. Exactly the reasoning
  behind `Location.hide_precise_location` below. The **frontend** picks - `es`
  reads the bare field, every other locale reads `en_*` and falls back to the
  bare field when the translation is blank.
- **Five locales, two languages, on purpose.** `apps/animals` ships en, es, de,
  fr and pt; de/fr/pt readers get the English. Storing five would triple the
  columns and the translation cost for three locales nobody has asked for.
- **A flattened relation label needs its `en_` twin too.** `SightingSerializer`
  carries `species_name`, `category_name`, `location_name`, `season_name` and
  `weather_name`; each now has a `*_en_name` beside it, and `SpeciesSerializer`
  has `category_en_name`. A feed card renders entirely from one payload, so
  without them an English reader gets a Spanish species beside an English story.
  **Add a flattened label and you must add its twin in the same task.**

What is deliberately _not_ translated: `slug` (a URL and a stable key - the seed
command matches on it, so renaming one creates duplicate rows), `scientific_name`
and `family` (Latin, identical in every locale), and the `KIND_CHOICES` /
`PLACE_TYPE_CHOICES` labels (a fixed enum the frontend translates through
next-intl).

⚠ **Every row written before this landed is English sitting in the Spanish
column.** `catalog/migrations/0003_copy_existing_copy_to_english` (and the
journal's twin) copied that text into `en_*` so re-authoring `name` in Spanish
cannot destroy it. Nothing was blanked, so those rows still read English on
`/es` until someone rewrites them. The same applies to a database seeded before
the change: `seed_reference` is idempotent by slug, so re-running it will not
translate what already exists.

## Seasons fill themselves from the date

`Sighting.save()` fills a **blank** `season` by matching the date's month against
`Season.months`; an explicit choice is never overwritten. Two consequences:

- **A fresh database needs `python manage.py seed_reference` before anything is
  filed**, or every entry gets no season and the seasons section stays empty.
  `--hemisphere south` flips the months; `--with-categories` adds a starter set of
  sub-categories. It is idempotent (matched by slug).
- `Season.for_date` scans in Python rather than using a `months__contains`
  lookup - that lookup is unsupported on SQLite, which is what development and
  the tests run on. Four rows; the scan is free.

## The four seed commands

Two fill the *what* and two fill the *where*, and each pair is containers-first:

- **`seed_reference`** creates the containers - seasons, weather conditions and
  (behind `--with-categories`) the sub-categories.
- **`seed_species`** fills those sub-categories with **1,296 species**: the common
  animals, plants, fungi, seasons and weather of the six regions this journal
  covers (Colorado, California, New York, Washington, Mexico City, Baja California
  Sur). 1,038 of those are the generated iNaturalist ranking; the remaining **258
  are a hand-written Colorado pass** - see "The Colorado pass" below.
- **`seed_geography`** creates the geography lookups - **2 countries, 83 states and
  244 counties**. Both countries the journal covers, every US state plus the
  District of Columbia, all 32 Mexican federal entities, and counties for the six
  regions above and *only* those (Colorado 64, California 58, Washington 39, New
  York 62, Mexico City's 16 alcaldías, Baja California Sur's 5 municipios). The
  other 77 states are seeded without counties on purpose: a county list nobody
  files against is three thousand rows of picker noise, and adding one later is a
  data change, not a code change.
- **`seed_locations`** fills two of those states with **149 places** - 117 in
  Colorado and 32 in Baja California Sur - across parks, reserves, national
  forests, lakes, peaks, trails and botanical gardens. Colorado's are two layers:
  the **statewide icons** (`sort_order` 0-61) and the **55 Front Range local
  places** (62-116) within reach of Longmont, Boulder, Denver, Loveland and Estes
  Park - municipal reservoirs and greenways, county open space, the Denver mountain
  parks and the named lakes inside Rocky Mountain National Park. `sort_order` is
  ranked *per region*, so Colorado's range and Baja's 0-31 deliberately overlap.

```bash
python manage.py seed_reference --with-categories   # containers first
python manage.py seed_species                       # then the contents
python manage.py seed_geography                     # countries -> states -> counties
python manage.py seed_locations                     # then the places in them
python manage.py seed_species --kind plant --update # refresh one branch
python manage.py seed_geography --country mexico    # or one country's geography
python manage.py seed_locations --state colorado    # or one state's places
```

Six things to know before touching them:

- **The first 1,038 rows of `catalog/data/species.json` are generated, not
  hand-written.** The species and their order come from iNaturalist's
  research-grade observation counts, queried **per region so each region gets an
  equal vote** - otherwise California, which has far more observers than the
  other five put together, decides what counts as "common" everywhere.
  `sort_order` *is* that ranking. Scientific names, families and the Spanish
  common names come from the same source. Re-deriving that block means re-running
  the query, not editing the file by hand. ⚠ The 258 Colorado rows appended after
  it are the exception and **are** hand-written; re-running the query must append
  to them rather than replace the file.
- **The prose is written for this project and is English in both halves of each
  pair.** Nothing is copied from Wikipedia or any other source, deliberately: a
  share-alike licence would follow the text into every cached payload. English
  in the Spanish column is the same state as every row that predates the
  bilingual fields - it keeps `/es` readable instead of blank and leaves
  `/api/ai/translate/` a source to translate from. The Spanish *names* are real.
- ⚠ **`--update` is off by default, and that default is the point.** The CMS
  exists so a person rewrites this copy; a seed command that overwrote their
  edits on every deploy would be worse than no seed command. `SEEDED_FIELDS`
  names exactly what `--update` touches - never `enabled`, `is_featured`,
  `image`, `icon`, `href` or `video_link`, which are an author's to set.
- **Every coordinate in `locations.json` is sourced, not estimated.** Each is
  either the coordinate Wikipedia publishes for that place through the MediaWiki
  `coordinates` API, or an OpenStreetMap/Nominatim match on the named feature, and
  each was checked against a bounding box for its region before being written -
  which is what caught five candidates whose only article coordinate pointed at a
  namesake elsewhere (Routt National Forest resolves into Wyoming, inside the
  combined Medicine Bow-Routt unit; "McIntosh Lake" into Washington state; "Mills
  Lake" into California). A place whose coordinate could not be sourced was
  **dropped rather than approximated** - Waterton Canyon is absent for exactly this
  reason, having no coordinate in Wikipedia or Overpass and only a Nominatim match
  on a road in a different canyon. A field journal that publishes a guessed pin is
  worse than one with fewer places.
- ⚠ **A location's `county` comes from the US Census geocoder, not from its
  coordinate source.** Nominatim contradicted itself on the two places at the east
  edge of Longmont (forward search said Weld, reverse said Boulder), and `county` is
  the only geography column a `Location` stores - so a wrong one silently misfiles
  the place's *state and country* too, since both are derived from it. Resolve a new
  place's county against the Census county layer rather than trusting a geocoder's
  address string.
- **`en_name` is blank wherever no distinct English form exists**, in both
  geography and locations - "Colorado", "Jalisco", "Isla Danzante" are spelled the
  same in both languages, and the frontend falls back to the base column for every
  locale whose twin is empty. It *is* filled where a real English form differs
  (Nueva York/New York, Laguna Ojo de Liebre/Ojo de Liebre Lagoon). The Spanish
  names of the US states follow **FundéuRAE**'s adapted list, which is why the data
  says "Hawái", "Míchigan" and "Pensilvania".

⚠ **No Baja California Sur location has `place_type = 'lake'`, and that is not a
gap.** The state has no natural lakes: its still water is coastal lagoon and
estuary (typed `wetland`) and its fresh water is the spring-fed palm oases (typed
`forest`). Colorado covers the lake type with ten rows.

⚠ **Running any of these from a laptop against the cluster database does not
invalidate the cluster's Redis.** The receivers in `signals.py` fire in the
process that wrote the row, and a local run caches into a local LocMemCache, so
the API keeps serving stale `species_count`s, a stale `/kinds/` nav and stale
geography lists for the full TTL. Either run the command inside the pod, or clear
the cache there afterwards:

```bash
kubectl -n animals exec deploy/animals-api -- \
  python manage.py shell -c 'from django.core.cache import cache; cache.clear()'
```

### The six categories `seed_species` adds

`seed_reference`'s starter set predates them, so the seed file carries its own
`categories` block and creates them itself - a database seeded before this
landed would otherwise have nowhere to file a coyote. Five are `animal`
(`carnivores`, `arachnids`, `marine-mammals`, `fish`, `hoofed-mammals`) and one
is `plant` (`cacti-succulents`). They exist because the starter set could not
hold the most-observed species in these regions at all: Coyote outscores the top
species of almost every other category, `Insecta` excludes every spider, Grey
Whale and Cardón are the signature sightings of Baja California Sur, and `deer`
is Cervidae - it cannot hold a bighorn sheep, a pronghorn, a mountain goat or a
bison, which is why `hoofed-mammals` was added with the Colorado pass.

Adding a category is **data, not code** - the five `KIND_CHOICES` branches are
structural and the frontend routes on them, but categories are rows, so a new
one needs no migration and no frontend change.

### The Colorado pass (the last 258 species)

The generated ranking gave each of the six regions an equal vote but capped every
category at 50, and the Rocky Mountain species lost those slots to coastal
California and Baja ones. The result was a catalog missing the Blue Jay, the
Mountain Chickadee, big sagebrush, and four of Colorado's six **official state
species** - the bighorn sheep, the Lark Bunting, the greenback cutthroat trout,
the Colorado hairstreak and the blue spruce (only blue grama and the blue
columbine were already in). 258 rows were added by hand to close that gap across
20 categories, birds most heavily.

Four conventions hold, and a further pass should keep to them:

- **Rows are appended, never re-ranked.** `sort_order` continues from each
  category's previous maximum, so the iNaturalist ranking still occupies the top
  of every category and no pre-existing row is touched - which is what keeps
  `--update` unnecessary for anything that was already there. Several categories
  are now well past 50 as a result; `birds` holds 138.
- **A new row must not duplicate an existing `scientific_name`.** Three
  candidates were already in the file under a different common name (Indian
  ricegrass as "Sand Ricegrass", *Boletus rubriceps* as "Ruby Porcini",
  *Gloeophyllum sepiarium* as "Conifer Mazegill"), and only a scientific-name
  check catches that - the slugs and English names collide with nothing. The 30
  rows with a `null` scientific name are the season and weather entries.
- **The prose and the bilingual rule are unchanged** from the generated block:
  written for this project, English in both halves of each pair, real Spanish
  common names where one exists and the English name repeated where none does.
- **Colorado only.** The other five regions were ranked fairly by the original
  query and were deliberately left alone.

## Geography is a catalog: `Country` → `State` → `County` → `Location`

A place used to carry its geography as free text - `region` ("State, province or
region"), `country` and a `map_link`. All three are **gone** (migration
`0006_state_county`, which drops them and migrates nothing), replaced by lookup
tables and the coordinates the site already had. `Country` joined the top of the
chain later, in `0009_country`.

```
Country(name, en_name, slug, code)
    ^
    |  FK (required, PROTECT)
State(name, en_name, slug, country)
    ^
    |  FK (required, PROTECT)
County(name, en_name, slug, state)
    ^
    |  FK (optional, SET_NULL)
Location
```

Five things to know:

- **They are lookup tables, not content.** `Common` + a name pair + a slug + a
  sort order. No `image`, no `icon`, no description pair, no gallery, no
  `/images/` endpoints, no public page. They exist so "Jalisco" is typed once
  and then _chosen_. If one ever needs a photograph it should become a
  `RegularPicture` like the other four records, not grow the fields in place.
  **`Country.code` is the one extra column** among the three - the ISO 3166-1
  alpha-2 identifier, nullable _and_ unique, which is why a blank is normalised to
  `NULL` in both `Country.clean()` and `CountryWriteSerializer` (two countries
  saved with `''` would collide on the second).
- **`Location` stores only its county; the state and the country are derived.**
  `Location.state` is a read-only property over `county.state` and
  `Location.country` one link further up, and both are flattened onto the payload
  (`state`/`state_name`/`state_en_name`/`state_slug`, and the same four plus
  `country_code` for the country) - the same reasoning as `Species.kind` over
  `category.kind`. Neither is **writable**, and there is no `state` or `country`
  column: two FKs could disagree, one cannot. `County.country` is the same
  derivation one level up, and is what feeds `CountySerializer`'s flattened
  country. The accepted cost is that a place whose county is unknown carries no
  state and no country either.
- **The three FKs differ on purpose.** `State.country` and `County.state` are
  required and `PROTECT` (deleting one still in use is a 409, like a category
  that still has species); `Location.county` is optional and `SET_NULL` (merging
  a county away must not take the places filed under it, exactly like `parent`).
- **There is no `map_link`, and it should not come back.** Every place carries
  coordinates and the CMS has a map picker for setting them, so the site draws
  its own map instead of linking out to someone else's.
- ⚠ **A county slug carries its state's abbreviation** - `jefferson-co`,
  `jefferson-wa`, `jefferson-ny`. `County.slug` is unique across the whole table
  and US county names repeat heavily, so an unsuffixed slug silently collapses
  three counties in three states into one row. `seed_geography` writes them this
  way; keep to it if you add a state's counties by hand.

⚠ `/api/ai/research/`'s `location` subject **must not** offer these.
`catalog/services/research.py` dropped `region`/`country` rather than renaming
them: a model that answers "Jalisco" cannot say _which row_ that is, and FKs are
absent from every subject's allowlist for exactly this reason.

## Coordinates: two rules that are easy to get wrong

- **A sensitive location blurs coordinates for _everyone_, staff included.**
  `Location.hide_precise_location` rounds the published latitude/longitude to two
  decimals (~1 km) in both `LocationSerializer` and `SightingSerializer`. It is
  **not** conditional on who is asking, because these payloads are cached under
  one key per resource: an admin-only precise variant would be written into the
  same cache and then served to the next anonymous visitor. An author who needs
  the exact spot reads it on the location's form in the CMS, or in the Django
  admin. Never make this per-user without splitting the cache key first.
- **Coordinates are published as JSON numbers**, not DRF's decimal-as-string -
  every map library takes numbers. They are the one exception; other decimals
  (temperature) keep the string form. A sighting with no coordinates of its own
  falls back to its location's, so `latitude`/`longitude` on a sighting payload
  are the _effective_ values, not the stored column.

⚠ **Both rules are re-implemented nowhere.** `journal/serializers.py` →
`effective_coordinate` is the single function behind the feed's pair _and_ the
map endpoint's; a second copy would eventually disagree with a sighting's own
page about where it happened - or, worse, publish the precise nest on the one
surface that forgot to blur.

### `/api/journal/sightings/map/` - pins, not entries

Its own endpoint rather than a flag on the feed, because it is a different
**shape** and a different **contract**:

- `SightingMapSerializer` drops the prose, the gallery and the field conditions.
  Pinning a category through the feed would ship every photo caption of every
  entry on the map.
- It answers a **bare list**, not a page. A map has no "next page", it has a
  bounding box; pagination would only ever be a way to draw an incomplete one.
  `MAX_MAP_PINS` (500) is the ceiling instead.
- **Only rows that can actually be pinned** come back, so the queryset expresses
  _both_ halves of the coordinate fallback (`Q(latitude…) | Q(location__latitude…)`).
  Filter on the sighting's own columns alone and every entry that inherits its
  place's centre - the common case - silently vanishes from the map.
- `?per_category=N` takes the latest N of **each** branch, which is what the
  landing asks for: newest-N-overall would show nothing but birds the week
  somebody spent birdwatching. Without it the endpoint is the plain newest-first
  feed, which is what one category's page wants.

Its cache namespace is `journal:map`, and it is cleared by the _catalog's_
receivers as well as the journal's - a pin carries a species' icon, so an author
uploading a glyph changes every marker of that branch without touching a single
`Sighting` row.

⚠ **The three marker glyphs are on `SightingSerializer` too** - `species_icon`,
`category_icon` and `category_color`, from the same getters. That is not the
endpoints blurring into each other: a **single entry's page** pins itself, and
without them the frontend would have to re-read a 500-pin list to dress the one
marker it already holds the coordinates for. They are three flattened fields on a
row the payload already `select_related`s, so they cost nothing. The map endpoint
remains what a map of _many_ entries reads - it is the rest of the feed payload
(the prose, the gallery, the conditions) that a map cannot afford, not these.

## The first photo is the record's cover

Every catalog record and every journal entry keeps its photographs in a **gallery
table** - `CategoryImage`, `SpeciesImage`, `SeasonImage`, `WeatherConditionImage`,
`LocationImage` (all five from the abstract `catalog.GalleryImage`) and
`journal.SightingMedia` - ordered by `sort_order`, and **the first row is the
record's main image**.

`core.serializers.gallery_image_url` is the single place that resolves it: a
record's own `image` column when it has one, and otherwise the first gallery row.
Both halves matter.

- **The CMS never writes the `image` column.** `apps/animals`' forms upload into
  the gallery and PATCH `sort_order` on every row after a drag, so for anything
  authored there the cover _is_ `images[0]` - which is what "upload several at
  once, the first is the main one" means. A record's `icon` stays a separate
  single field: it is a 128 px glyph for a map pin or a filter chip, not a
  photograph, and must never join the gallery.
- **The column still wins when it is set**, because the Django admin and
  `seed_reference` can set it and a cover chosen deliberately must not be
  overruled by whatever happened to be uploaded first.
- **`catalog.Location` has no `image` column at all** (it is not a picture
  model), so there the first gallery row is the only cover there is. It did gain
  an `icon`, which is the one image field it owns.

Three consequences that are easy to miss:

- **A `*Image` write can change the record's _cover_, not just its gallery.** So
  its receiver in `signals.py` must clear the record's own list **and** detail
  namespaces, plus anything that embeds a thumbnail of it - which is why a
  `SpeciesImage` write also invalidates sightings (`species_image`).
- **Every flattened thumbnail must go through the same helper.**
  `SightingSerializer.species_image` does; a new one that reads `obj.x.image`
  directly would render blank for every record authored in the CMS.
- **A gallery table belongs in `MODEL_SPECS`.** Backup introspects fields but not
  models, and an archive that skipped these would restore a catalog with no
  pictures at all rather than merely fewer.

`GalleryImageListCreateView` / `GalleryImageDetailView` in `catalog/views.py` are
one pair of views subclassed per parent (model + serializers + cache prefixes);
`GalleryImageSerializer` / `GalleryImageWriteSerializer` are the matching pair in
`catalog/serializers.py` (declared above every record serializer, since each
record embeds its own gallery). Adding a gallery to a sixth record is a model, two
serializer subclasses, two view subclasses, two URLs, a receiver, a `MODEL_SPECS`
line and an admin inline - and no new logic.

## Images ride in JSON, video does not

Every image is a **base64 string in a JSON body**, processed by
`ImageProcessingSerializer` and capped by `DATA_UPLOAD_MAX_MEMORY_SIZE` (10 MB) -
the same pattern as website-api. Write serializers declare their images through
`Base64ImagesMixin`, which validates them up front, writes them _after_ the row
exists (the filename embeds the pk), and treats an explicitly empty value as
"clear it" while an omitted one leaves the stored file alone.

⚠ **A video file does not go that route either, and no longer reaches this
service at all.** A source clip is a camera-roll 4K recording - a few GB - and
three separate things make it impossible here: Cloudflare caps a request to
`animals-api.iguzman.com.mx` at ~100 MB, a multi-GB upload would occupy one of
three **sync** gunicorn workers for its whole duration, and there is no ffmpeg in
this image and no worker to run it in. The multipart endpoint that used to try is
gone.

**The pipeline lives in `apps/animals` (Next.js).** The browser uploads the clip
in ≤90 MB chunks to a pod's own local disk (sticky sessions pin all of one
upload's chunks to one pod), that pod transcodes it with ffmpeg, PUTs the ~100 MB
result straight to R2, and reports back here. This API only ever holds control
messages:

```
POST  .../media/video/             reserve an empty row -> pending   (IsSiteAdmin)
POST  .../media/video/contribute/  the same, from the public flow    (IsContributor)
PATCH .../media/<pk>/processing/   the handler reporting the result  (shared secret)
```

Four things that will bite:

- ⚠ **The status callback is authenticated by `VIDEO_HANDLER_TOKEN`, not by a
  session** - the only endpoint here that is. A transcode runs for minutes after
  the request that started it returned, and usually outlives the session too, so
  there is no user token left to present. **Unset, it refuses everything**: an
  empty configured secret must never match an empty supplied one, or the endpoint
  is world-writable. There is a test for exactly that.
- ⚠ **`processing_error` holds a short code, never ffmpeg's stderr.** This payload
  is cached under one key and served to every caller, staff or not - the
  `hide_precise_location` trap - so anything written there is public, and stderr
  carries absolute paths from inside the pod. The handler maps its failure to one
  of `too_long`, `too_large`, `unsupported_format`, `probe_failed`,
  `encode_failed`, `upload_failed`, `abandoned`, and logs the detail on its side.
- **The stale sweep is derived at read time, not written by anything.** The raw
  upload sits on one pod's local disk, so a rollout, an OOM or a node drain takes
  the job with it and leaves nothing to write `failed`. There is no Celery and no
  cron in this project, so `SightingMedia.effective_processing_status` simply
  *reports* a row still in flight past `VIDEO_PROCESSING_TIMEOUT_MINUTES` as
  failed - which needs no scheduler and corrects itself if the pod comes back and
  finishes late. The serializer publishes that, not the stored column.
- **A `video` row exists before its file does**, so `clean()` skips the
  "kind requires its field" check while the row is still in flight, and
  `source_url` is null until the transcode lands - which is what the public page
  renders as "processing" rather than as a broken player.

The limits, and where each actually lives:

| Limit                              | Where                                    | Value      |
| ---------------------------------- | ---------------------------------------- | ---------- |
| Source clip size (declared)        | `MAX_VIDEO_UPLOAD_MB`                    | 3000 MB    |
| Contributor clip length            | `MAX_CONTRIBUTION_VIDEO_SECONDS`         | 90 s       |
| Contributor clips per rolling day  | `MAX_CONTRIBUTION_VIDEOS_PER_DAY`        | 5          |
| Abandoned-transcode timeout        | `VIDEO_PROCESSING_TIMEOUT_MINUTES`       | 45 min     |
| Output resolution / CRF / codec    | `System.video_*`, authored at `/admin/system` | 1080p / 23 / h264 |

⚠ **`proxy-body-size` is no longer one of them.** It is sized for the backup
restore alone; raising it does nothing for video, and sizing video against it is
how the old 200 MB ceiling came to be documented in three places.

`SightingMedia` is one model with a `kind` (`image` / `video` / `link`) rather
than three models, because a gallery is a single ordered list the author
arranges - a clip may sit between two photos, and three tables cannot share one
`sort_order`. Each kind requires its own field (`image` / `file` / `url`),
enforced in both `clean()` (admin) and the write serializer (API). `source_url`
on the payload is the one URL to point a player or an `<img>` at, whatever the
kind, so the frontend renders a tile without a three-way branch.

## The generic cached views

`core/views.py` carries `CachedListCreateView` and `CachedDetailView`. website-api
spells these out per model, which is why its `catalog/views.py` is 1,400 lines of
the same eight methods; here a concrete view names its model, its two serializers
and its two cache prefixes, and overrides `filter_queryset` for its own query
params. What a subclass gets, and must not undo:

- **GET public, writes admin-only** (`IsSiteAdmin`), via `get_permissions`.
- **Every cache key includes the resolved disabled-visibility**, never the raw
  `include_disabled` param - otherwise an admin response containing drafts is
  replayed to the next anonymous caller. There is a test for exactly that.
  ⚠ The CMS asks for `?include_disabled=true` on **every** read, so this is not
  a corner case any more - it is the path every authoring page takes. That
  includes the **detail** keys: a draft is addressable by pk for an
  administrator, so `CachedDetailView` suffixes its key with `:staff` for a
  request that may see one. Before the CMS sent the param on a detail read, an
  author could list an unpublished row and then not open it (404).
- **Every resource is addressable by pk _and_ by slug** (`/slug/<slug>/`, spelled
  with the literal so a numeric slug can never be read as a pk). The public site
  uses slugs; both are cached, under distinct keys, and a write clears the old
  slug's key as well as the new one's.
- **Sightings paginate** (`{count, limit, offset, results}`, capped at 100); the
  catalog lists return bare arrays. The feed grows without bound - the catalog
  does not.
- ⚠ **Species is the exception, and it paginates _only when asked_.** It sets
  `paginate_on_request = True` (`core/views.py`), so `?limit=`/`?offset=` switches
  that one response to the same envelope while every other caller still gets a bare
  array. Two reasons it is not simply `paginate = True`. A species row is the
  most expensive one this API serializes - `sighting_count` and `last_seen` are
  **per-object** queries, plus its gallery - and the CMS's list asks for every row
  including the unpublished drafts, which is the read that got slow. But the public
  grids read a whole category or the featured set in one request and would all have
  to learn a new payload shape for a problem they do not have. So `/admin/species`
  sends `?limit=50` and reaches the rest through `?search=` (which matches `name`,
  `en_name`, `scientific_name` and `family`), and nothing else changed. The
  consequence to keep in mind: **adding `limit` or `offset` to any species request
  changes that caller's payload from an array to an envelope**, and the two are
  separate cache entries (both params are part of the list key).

## Cache invalidation

Two switches and one rule.

**Development caches nothing.** `API_CACHE_ENABLED` defaults to `not DEBUG`, and
`core/cache.py`'s `cached_get`/`cached_set` - the only way a view may touch the
response cache - are no-ops when it is off. So an edit made in the Django admin
is visible on the next page load. Set `API_CACHE_ENABLED=True` in `.env` to
reproduce the production path locally. It is a switch on the _response_ layer,
not on `CACHES`: the cache also holds WebAuthn challenges mid-ceremony and (on
Redis) sessions, so a `DummyCache` backend would break passkeys on a laptop. In
the cluster it is set explicitly in `helm/values.yaml` rather than left to
`DEBUG`, which arrives from the secret.

**The frontend caches too, and does not know about any of this.**
`apps/animals/lib/fetch-cache.ts` is Next's half: `no-store` in `next dev`, a
5-minute revalidate in production. Turning off only one of the two caches changes
nothing an author can see.

⚠ **The receivers in `signals.py` are the primary invalidation path, not a
backstop.** The Django admin is the CMS, so a real edit is a `Model.save()` that
never reaches `CachedViewMixin.invalidate_list`. **A receiver must clear its own
namespace first**, then everything that embeds it. Skipping the first half is not
theoretical: a `Category` write cleared species, sightings and the kinds nav but
not `catalog:categories`, so an icon uploaded in the admin did not appear on the
landing page for the full TTL.

Two traps worth knowing before you touch this:

- **The bare key.** `core/views.py`'s `list_key` returns the _unprefixed_
  namespace for a request with no query params - `/api/catalog/categories/`
  caches under exactly `catalog:categories`, which `catalog:categories:*` does
  **not** match. Always invalidate through `core.cache.invalidate()`, which
  deletes both; a hand-written `invalidate_pattern` misses the one key the
  landing page actually reads.
- **Tests need a Redis-faithful cache.** `invalidate_pattern` falls back to
  `cache.clear()` when the backend has no `delete_pattern`, so on plain
  LocMemCache _any_ invalidation wipes everything and an incomplete receiver
  passes. `IsolatedMediaTestCase` therefore pins
  `core.testing.PatternLocMemCache` (LocMem + a real glob `delete_pattern`) and
  forces `API_CACHE_ENABLED=True` - without both, every "the write is visible
  afterwards" assertion in this project is vacuous. That gap is why the Category
  bug shipped green.

Cache-key namespaces are constants in `catalog/cache_keys.py` and
`journal/cache_keys.py`, imported by both the views that write them and the
signals that clear them - a typo in either place would otherwise be silent.

What is specific here is _what embeds what_, and it lives in `catalog/signals.py`
and `journal/signals.py` with a table at the top of each. The pairings that bite:

| Writing this                                              | Also stale                                                                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Category`                                                | every species payload (`category_name`/`slug`/`kind`), the `/kinds/` nav, sightings                                                             |
| `Species`                                                 | every category payload (`species_count`), the `/kinds/` nav, sightings                                                                          |
| `Sighting`                                                | that species (`sighting_count`, `last_seen`), the season / weather / location lists (each carries `sighting_count`), and `/journal/stats/`      |
| `SightingMedia`                                           | that sighting - its payload embeds the gallery, **and** its cover image falls back to the first photo                                           |
| `SeasonImage` / `WeatherConditionImage` / `LocationImage` | that record - same reason: the gallery _and_ the cover                                                                                          |
| `Country`                                                 | states (`country_name`/`slug`/`code`), **and** counties and locations, which flatten the country read _through_ the state - three tables away    |
| `State`                                                   | counties (`state_name`/`slug`) **and** locations, which flatten the state read _through_ the county - two tables away from the row that changed |
| `County`                                                  | locations (`county_name`, the state behind it and the country behind that), states (`county_count`, `location_count`) and countries (`location_count`) |

⚠ **Add a derived or flattened field to a serializer and you must add its
receiver in the same task.** A stale count looks exactly like a lost write.

Note one deliberate divergence: `core/cache.py`'s `invalidate_pattern` falls back
to `cache.clear()` when the backend has no `delete_pattern`. website-api silently
skips there, which would leave an edit invisible for the whole TTL. Redis has
`delete_pattern`, so the fallback never runs in production - and the test suite
runs on `core.testing.PatternLocMemCache` precisely so it never runs there
either, since a blanket clear makes a missing receiver undetectable.

## Site settings: a singleton, not a tenant

`core.System` holds this one site's name, its description pair, its contact
details and its whole brand kit (logo, hero logo, favicon, brandmark, about and
hero images, five manifest icons, two colours, three typography fields, the
framed-heading switch, eight watermark fields and the two page backgrounds).

**It is not website-api's `System`, and the difference is the whole tenancy
note above.** There, `System` _is_ the tenant: every row FKs to one and a request
resolves which by host. Here nothing points at it, there is no `host` column, and
`System.load()` - `get_or_create(pk=1)` - is the only way it is ever fetched. Do
not give a content model a FK to it, and do not add a host.

Three rules worth knowing:

- **`System.load()` creates the row with its defaults if it is missing**, so a
  fresh database serves the defaults rather than 404ing before anyone has opened
  the CMS. The frontend has a matching `SYSTEM_FALLBACK`, so a _dead_ API costs
  the branding rather than the site.
- **`GET /api/system/` is `AllowAny` and is read on every page of the public
  site.** Nothing may go on `SystemSerializer` that is not meant to be
  world-readable. There is no credential on this model today; if one is ever
  added it belongs on the write serializer as `write_only` and on nothing else -
  the Stripe/R2 rule from website-api, which this model has so far avoided
  needing.
- **`google_font_url` is host-restricted in three places** - the model validator,
  `SystemWriteSerializer.validate_google_font_url`, and `isGoogleFontUrl` in the
  frontend's `lib/fonts.ts`. The frontend check is not redundant: the value lands
  in a `<link rel="stylesheet">` on every page, and a row written before the
  validator existed (or straight into the database) would otherwise pull a
  stylesheet from an arbitrary origin.

The two CMS pages that write it (`/admin/system` and `/admin/logos-and-styles`)
each PATCH **only the keys they own**, which is what keeps them from clobbering
each other when both are open. If you move a field between those pages, move it
between their `OWNED_FIELDS` lists in the same edit.

`core/signals.py` clears `core:system` on every write. That receiver is the
primary path, not a backstop - the Django admin is still an authoring surface
here, and an edit made there never reaches the view.

## Branded email - always through `core/email.py`

Every email this backend sends is composed in **one** place:
`core.email.send_branded_email(subject, template, recipients, context)`. It is a
port of website-api's `_send_branded_email` with the tenancy taken out - there,
the branding depends on which tenant the recipient belongs to, which is why that
project repeats the brand dict in `users/views.py` **and**
`core/services/contact.py`; here there is one `System`, so one module serves
every sender. That is why it lives in `core` and not in `users`, which is its
only caller today (verification + password reset).

- **Two parts, always.** `send_branded_email` renders `<template>.txt` _and_
  `<template>.html` and attaches the second as an alternative. The templates are
  bilingual - Spanish first, English below - matching website-api and this
  project's Spanish-bare/`en_`-twin content rule. A client that refuses HTML
  still gets a readable message with a working link.
- **The chrome is the CMS's brand kit.** `core/templates/email/base.html` (plus
  `_button.html`) draws the header disc from `System.img_logo`, the header from
  `primary_color`, the accent rule from `secondary_color` and the canvas from
  `background_light`. A message template extends it and fills `{% block body %}`,
  so an author who re-brands at `/admin/logos-and-styles` re-brands the email
  with no template change. Tables and inline styles only - `<style>` blocks and
  flexbox do not survive an email client.
- **The logo must be an absolute URL.** An email has no request to resolve
  `/media/…` against, so `core/media.py`'s `absolute_media_url` prefixes
  `MEDIA_BASE_URL` - and leaves an R2 URL alone, since `FileField.url` is already
  absolute there. Never write `f"{MEDIA_BASE_URL}{file.url}"` by hand: in
  production that glues two absolute URLs together and the image silently breaks.
- **Links point at `FRONTEND_URL`**, locale-less (`/verify-email/<token>`) - the
  app's proxy adds the reader's locale prefix.
- **`users/views.py` swallows a send failure and returns a bool.** Sign-up and
  password-reset answer 200 either way (sign-up surfaces `email_sent`), so an
  SMTP outage must not lose the account just created, nor leak by its error
  whether an address is registered. The exception is logged.

With no `EMAIL_HOST_USER` set, `settings.py` uses the console backend - so
locally the whole rendered message prints to the runserver output and nothing is
sent.

## Backup & restore (`core/backup.py`)

A port of website-api's engine with the multi-tenancy taken out: one site, so no
`System` to scope a queryset by, no cross-tenant key theft to defend against, and
no host on the manifest to match an archive against. Read that project's CLAUDE.md
section too - the four load-bearing rules (secrets never travel, `auto_now` is
re-applied with a follow-up `UPDATE`, each row is its own savepoint with the `try`
_outside_ the `atomic()` block, PROTECT edges decide the order) are unchanged and
each is commented at its site.

- **Rows are built by introspecting `_meta.concrete_fields`.** Adding a field to a
  model needs no edit here. Adding a whole **model** does - `MODEL_SPECS` states
  only what introspection cannot know: a model's section, and what identifies one
  of its rows across two databases.
- **Sections are `settings` / `catalog` / `journal`, plus the cross-cutting
  `images` toggle** - not a section itself: it decides whether the media files of
  the _selected_ sections travel with them. `apps/animals`' `BACKUP_SECTIONS` must
  match `ALL_SECTIONS`; the CMS's section switches and its history badges read one
  shared label map for the same reason.
- **`auth.User` and `users.UserProfile` are `never_delete`.** On a single-site
  install, a replace-mode wipe of the user table would take the last
  administrator's login with it - and the profile is what carries `is_admin`.
- **No password hash travels**, so a _newly created_ account cannot be signed into
  until its owner runs a reset. An account that already exists keeps the password
  it has: a restore may not lock a live user out.

⚠ **An archive is the site's whole database and is served with no authentication
in front of it.** In production it is an object in the R2 bucket a Cloudflare
custom domain publishes, and R2 has no per-object ACL. What keeps it private: the
uuid4 in `backup_upload_path`, `SiteBackupSerializer` never exposing `file`, and
`SiteBackupDownloadView` being the only sanctioned read path. **A Cloudflare WAF
rule blocking `/backups/*` on the public hostname is the second lock and costs
nothing** - this code only ever reads through the S3 endpoint.

Building and restoring are **synchronous** - one request that serialises the
database and copies every photograph - which is what the 600s gunicorn and
ingress timeouts are for, and why the CMS's progress bar is indeterminate. A real
percentage needs a job-state model and polling, not a UI change.

## LLM calls - always through `core/services/llm.py`

Every AI call runs in this backend, never in the Next.js app. `core/services/llm.py`
is a straight port of website-api's module - **Groq primary, OpenRouter fallback** -
and the two should be kept in step rather than allowed to drift. Never call a
provider SDK from a view, and never move a key into the frontend.

- **The stream fallback only covers failures before the first token.** Once Groq
  has emitted content the user is reading it, so restarting on OpenRouter would
  duplicate output; a mid-stream failure propagates. An empty Groq stream counts
  as a failure and does fall back. `chat_json` falls back on anything, including
  a reply that will not parse - nothing has been shown yet.
- Config: `GROQ_API_KEY`, `GROQ_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
  `LLM_REQUEST_TIMEOUT`, plus `SCRAPER_BASE_URL` / `SCRAPER_API_KEY` for web
  research. In the cluster they arrive through the `animals-api-secrets` bundle;
  locally from `.env`. With neither LLM key set the `/api/ai/*` endpoints answer
  **503**, so a 503 from one means the key never reached the process.
- **gunicorn runs `gthread` workers** (`gunicorn.conf.py`) because streaming
  holds a worker for the whole generation. With plain sync workers two concurrent
  authoring requests would block the public journal feed.

### The four authoring endpoints (`core/ai_views.py`, all `IsStaffUser`)

```
POST /api/ai/chat/       stream an arbitrary completion as OpenAI-shaped SSE
POST /api/ai/translate/  fill the other half of a Spanish/English field pair
POST /api/ai/copy/       write or polish a description in one language
POST /api/ai/research/   draft a whole catalog record from live web sources
```

- **They are drafting tools: none of them writes to the database.** Each returns
  a patch for the author to review and apply through the normal endpoints (or to
  retype in the Django admin). A journal's whole value is that a person vouched
  for what it says - do not "streamline" one of these into a direct write.
- **Staff-only, unlike every read endpoint here.** They spend money at a provider
  and produce copy published under the journal's name.
- **`/api/ai/research/` filters the model's answer against a per-subject
  allowlist** (`catalog/services/research.py` → `_SUBJECTS`), so a hallucinated
  _field_ lands nowhere - `slug`, ids, FKs and images are absent by design. It
  cannot filter a hallucinated _fact_: `sources` and `used_web_search` come back
  alongside so the author can check. The scraper is optional; unconfigured or
  down, it answers from the model's own knowledge with no sources rather than
  failing.
- **Errors in the streaming endpoint must be reported inside the stream**
  (`data: {"error": …}`) - `StreamingHttpResponse` commits the 200 before the
  generator runs, so validate anything that could 4xx/5xx _before_ returning the
  response. `X-Accel-Buffering: no` is required or nginx delivers the whole
  completion in one lump. Provider errors are logged in full and reported
  generically; an upstream body can carry prompt text.

Adding a translated field means adding it to `TRANSLATED_FIELDS`, which is what
`/api/ai/translate/`'s allowlist is derived from - no edit needed in the AI layer.

## Public contributions - two endpoints, and the line they must not cross

A signed-in reader can propose a **species** and file a **sighting** without the
CMS (`apps/animals`' `/contribute/*` flow). Two POST-only endpoints serve it:

```
POST /api/catalog/species/contribute/      IsContributor  -> a pending Species
POST /api/journal/sightings/contribute/    IsContributor  -> a pending Sighting
```

⚠ **They are separate URLs with separate serializers on purpose, and that is the
whole safety argument.** `CachedViewMixin.get_permissions` is what makes every
write on every resource admin-only; relaxing it would open the entire API to
every account at once. Instead: `core/permissions.py` → `IsContributor` (any
authenticated user) guards **only** these two views, and there is no path by which
widening them widens anything else. There is a test asserting exactly that
(`core/contribution_tests.py` → `test_the_ordinary_write_endpoints_are_still_admin_only`).

The shared machinery is in `core/`: `contributions.py` (the `photos` field, the
ceiling, `ContributionSerializer`), `contribute_views.py` (`ContributeView`) and
`slugs.py` (`unique_slug`).

Seven rules:

- **A contribution is created `enabled=False`** and marked `is_contribution=True`,
  so it is absent from every public read - the feed, the map, the stats, the
  catalog lists - with no second visibility rule for a list endpoint to forget.
  Publishing is an ordinary admin PATCH; the CMS lists it because every CMS read
  sends `include_disabled=true`. **There is no moderation endpoint and none is
  needed.**
- ⚠ **A contribute serializer is a _sibling_ of the CMS write serializer, never a
  subclass.** Inheriting a field list is exactly how `enabled` or `is_featured`
  would one day become publicly writable. The field lists are separate, and the
  only way to widen the public one is to type the field into it. `create()`
  hard-codes `enabled`, `is_featured` and (for a species) `sort_order` regardless
  of what was sent.
- **`href` and `video_link` are absent from both**, deliberately: an arbitrary
  outbound URL on a row anyone may create is link spam with no upside for a field
  guide. An administrator can add either after review.
- **Only the base half of each text pair is writable** (`name`, not `en_name`) -
  see "Bilingual content" above: the frontend falls back to the base column for
  every locale whose twin is blank, so a contribution typed in one language reads
  correctly in all five.
- **The API derives the slug** (`core/slugs.py`), because nobody types one in the
  public flow. It counts up (`red-fox-2`) rather than appending a token, so the
  URL stays recognisable, and it falls back to a fixed stem when the name
  slugifies to nothing - which a name in a non-Latin script does.
- **Photos and the record travel in one request**, unlike the CMS's
  create-then-POST-each-photo path: a contributor has one Submit button, and a row
  that survived while its pictures failed is a pending entry nobody can tell is
  broken. Every photo is validated **before** the parent row is created, capped at
  `MAX_CONTRIBUTION_PHOTOS` (10, mirrored in `lib/contribute.ts`), and written
  through the record's existing gallery writer - so this path shares the image
  pipeline rather than growing a second one. `photos[0]` becomes the cover.
- **Cross-checks the CMS does not need.** A contribution may not be filed under a
  **disabled** category, nor against a **pending** species (that entry would wait
  on something that may never be approved - and if the species were rejected,
  `PROTECT` would leave the sighting holding a row nobody can delete); a sighting
  needs a place **or** a coordinate pair; and its date may not be in the future.

### The credit line: derived from `created_by`, never stored

`Sighting` carries **two** author fields, and only one of them is written:

| Field              | What it is                                                                | Published                    |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------- |
| `created_by`       | the **account** - the audit trail, and the source of the credit line      | its `first_name`, nothing else |
| `author_anonymous` | the contributor's answer to "credit me?"                                  | yes                          |

There is **no `author_name` column** (migration `journal/0005_remove_sighting_author_name_and_more`
drops it, and migrates nothing - see the note in the file). `author_name` is still
on the read payload, but as a `SerializerMethodField` over
`created_by.first_name`, so a contributor who corrects the name on their account
corrects every entry they ever filed, and no typed-in name can drift from the
account that actually filed it.

⚠ **Anonymity is applied at render here, and that is only safe because this field
does not vary by who is asking.** The payload is cached under a key that varies
only by the query params and the resolved disabled-visibility, so anything reading
differently for an administrator would be filled once by an admin request and then
replayed to every anonymous visitor - the `Location.hide_precise_location` trap.
Every caller gets the same string from `get_author_name`, so there is nothing to
replay wrongly; and what it publishes is a **first name and nothing else** - the
id, the email and the username never leave this API. The upside over the old
clear-it-at-write-time rule is that a contributor can change their mind: flipping
`author_anonymous` in the CMS now actually un-credits an entry.

**Three different things read as an empty credit line**, and the frontend renders
all three identically (no byline): the contributor chose anonymity, the entry was
authored in the CMS (`created_by` is null - nothing sets it there, deliberately),
and the account never filled in a first name, which is optional at sign-up.
`author_anonymous` still travels so the CMS can tell the first from the others -
a reviewer must not read "chose not to be credited" as an invitation to name them.

⚠ **`_SIGHTING_SELECT` in `journal/views.py` joins `created_by` for this**, not for
the audit trail. Drop it and a 100-entry feed page costs 100 extra queries. The map
endpoint does not need it - `SightingMapSerializer` carries no credit.

The trade, accepted deliberately: **an author can no longer credit someone else.**
A CMS entry has nobody to credit at all, and the free-text field that used to cover
"I am filing my friend's photograph" is gone. `Species` carries only `created_by`
and `is_contribution` - it is the shared reference record, and there is nobody on
it to credit.

## Endpoints

All public on GET, admin-only on write (`IsSiteAdmin`).

```
# Site settings - the singleton. No pk: there is only ever one row, and an
# addressable id would invite code that assumes there could be a second.
GET    /api/system/                                 public; read on every page
PATCH  /api/system/                                 admin only

# Backup & restore - admin only. Building and restoring are synchronous, which
# is what the 600s gunicorn/ingress timeouts are for.
GET/POST          /api/backups/
DELETE            /api/backups/<pk>/
GET               /api/backups/<pk>/download/       streams the zip
POST              /api/backups/restore/             multipart, ?mode=replace|merge

# CMS user management - admin only. Read-only but for two flags; see
# users/serializers.py for how narrow it deliberately is.
GET               /api/auth/admin/users/
GET/PATCH         /api/auth/admin/users/<pk>/       is_admin / is_active

# Re-mints both tokens from the live user, so a changed claim reaches the
# frontend without waiting out the refresh token's 7 days.
POST              /api/auth/token/reissue/

GET    /api/catalog/kinds/                          the five branches + counts
GET    /api/catalog/categories/                     ?kind= ?featured= ?search= ?slug=
GET    /api/catalog/species/                        ?kind= ?category= ?category_slug= ?featured= ?search=
                                                    ?limit= ?offset=   (envelope ONLY when either is sent)
GET    /api/catalog/seasons/
GET    /api/catalog/weather-conditions/
GET    /api/catalog/countries/                      ?slug= ?code= ?search=
GET    /api/catalog/states/                         ?country= ?country_slug= ?slug= ?search=
GET    /api/catalog/counties/                       ?state= ?state_slug= ?country= ?country_slug=
                                                    ?slug= ?search=
GET    /api/catalog/locations/                      ?parent= ?place_type= ?county= ?state=
                                                    ?country= ?country_slug= ?featured=
GET    /api/journal/sightings/                      ?species_slug= ?kind= ?location_slug= ?season_slug=
                                                    ?year= ?month= ?date_from= ?date_to= ?limit= ?offset=
GET    /api/journal/sightings/map/                  ?category_slug= ?kind= ?species_slug=
                                                    ?location_slug= ?per_category= ?limit=
GET    /api/journal/stats/                          landing-page headline numbers

# each of the above resources also has:
GET/PATCH/DELETE  .../<pk>/
GET               .../slug/<slug>/

# The public contribute flow - any signed-in account, POST only. Separate URLs
# with separate serializers, NOT a relaxed permission on the lists above; the row
# lands enabled=False and is published by an administrator. See the section above.
POST   /api/catalog/species/contribute/             IsContributor
POST   /api/journal/sightings/contribute/           IsContributor

# Photo galleries. GET is public like every other read; the first row is the
# record's cover, so `sort_order` on the PATCH is what picks it.
GET/POST          /api/catalog/categories/<pk>/images/[<img_pk>/]
GET/POST          /api/catalog/species/<pk>/images/[<img_pk>/]
GET/POST          /api/catalog/seasons/<pk>/images/[<img_pk>/]
GET/POST          /api/catalog/weather-conditions/<pk>/images/[<img_pk>/]
GET/POST          /api/catalog/locations/<pk>/images/[<img_pk>/]
PATCH/DELETE      ...the same URLs with an <img_pk>                   admin only

POST/PATCH/DELETE /api/journal/sightings/<pk>/media/[<media_pk>/]     JSON, image or link

# Video. No file travels through this API - these reserve a row and record where
# the handler in `apps/animals` got to. See "Images ride in JSON, video does not".
POST   /api/journal/sightings/<pk>/media/video/                      reserve a row (admin)
POST   /api/journal/sightings/<pk>/media/video/contribute/           IsContributor, own pending entry
PATCH  /api/journal/sightings/<pk>/media/<media_pk>/processing/      handler callback, shared secret

# AI authoring - admin only, drafting only (see the LLM section above)
POST   /api/ai/chat/        /api/ai/translate/   /api/ai/copy/   /api/ai/research/
```

Every catalog and journal payload carries **both** languages of each text field
(`name` + `en_name`, …) - see "Bilingual content" above. `?search=` matches
either language.

`?include_disabled=true` is honoured for administrators on every list **and on
every detail read**, ignored for everyone else. The CMS sends it on both, which
is how an author sees a draft they have not published yet - and, on the detail
route, how they open its form at all.

## Tests

`python manage.py test` (194 tests: `catalog`, `journal`, and `core` for the AI
endpoints, the permission model, the site-settings endpoint, the branded emails,
the backup round-trip and the public contribute flow - the AI tests always mock
the provider, so the suite spends nothing and needs no network). The contribute
tests live in `core/contribution_tests.py` and are **imported** by `core/tests.py`
rather than discovered: the runner only collects `test*.py`, and that module is one
feature's contract spanning `catalog` and `journal`, so it belongs beside neither. Inherit
**`core.tests.IsolatedMediaTestCase`** for anything that writes: it redirects
`MEDIA_ROOT` to a temp directory and clears the cache between tests. Without the
first, test uploads scatter through the developer's own `media/`; without the
second, one test's cached list is served to the next.

It carries three factories, and **which one a write test uses is the assertion**:
`make_staff()` (Django staff, no profile flag - every account that predates
`is_admin`), `make_admin()` (the flag, _not_ staff - the account the CMS exists
for), and `make_visitor()` (signed in, may read, may not write). A permission
change that quietly collapsed the two admins into one would still pass a suite
that only ever used `make_staff`.

⚠ `make_visitor()` fills `first_name` by default, because that is what a
contribution's **credit line** is now derived from - a factory that left it blank
would make every byline assertion pass against an empty string. Pass
`first_name=''` for the account that skipped the field at sign-up, where it is
optional.

⚠ `make_admin()` ends with `user.refresh_from_db()`, and that line is load-bearing:
`users.signals` creates the profile during `create_user`, which populates the
one-to-one cache on `user`, so without the refresh `user.profile` keeps returning
the pre-flag copy and every permission check reads `False`.

Locally the `.env` points Redis and Postgres at the cluster, so run with
`REDIS_PASSWORD='' DB_PASSWORD=''` to stay on SQLite + LocMemCache.

## Not built yet

Deliberately out of scope so far - decide before adding, do not assume:

- **`/api/ai/copy/` and `/api/ai/research/` still have no caller.** The CMS in
  `apps/animals` wires up the per-field **enhance** and **translate** buttons
  (both stream through `/api/ai/chat/`), but the two structured drafting
  endpoints - write a description in one language, and draft a whole catalog
  record from live web sources - are still unused. They were built REST-first
  for exactly this, so wiring them into the species form is the intended next
  step; the research endpoint's per-subject allowlist is the reason it is worth
  doing properly rather than as another free-text prompt.
- **The Django admin still has no per-field AI controls.** It renders the `en_*`
  fields as plain inputs. The CMS is where those buttons live now, so this is
  unlikely to be worth adding.
- **No translations beyond Spanish and English.** de/fr/pt readers get the
  English; see "Bilingual content" above for why five stored languages was
  rejected.
- **No comments, likes or follows.** It is a journal, not a network.
- **A contributor cannot read back their own pending records.** `created_by` and
  its index exist on both models, but there is no `?mine=true` on either list and
  no endpoint that answers "what have I submitted?" - so the frontend can only
  confirm the submission, not track it. Adding one means deciding whether it is a
  filter on the existing lists (which are cached under keys that do **not** vary
  by user - so it would need its own namespace, or no caching at all) or a
  separate uncached view. The second is almost certainly right.
- **No trip/outing grouping.** A day out is currently N separate sightings that
  share a date and a location.
