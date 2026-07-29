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
  the record's cover"). Also `State` and `County` - see "Geography is a catalog".
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

## Geography is a catalog: `State` → `County` → `Location`

A place used to carry its geography as free text - `region` ("State, province or
region"), `country` and a `map_link`. All three are **gone** (migration
`0006_state_county`, which drops them and migrates nothing), replaced by two
lookup tables and the coordinates the site already had.

```
State(name, en_name, slug)
    ^
    |  FK (required, PROTECT)
County(name, en_name, slug, state)
    ^
    |  FK (optional, SET_NULL)
Location
```

Four things to know:

- **They are lookup tables, not content.** `Common` + a name pair + a slug + a
  sort order. No `image`, no `icon`, no description pair, no gallery, no
  `/images/` endpoints, no public page. They exist so "Jalisco" is typed once
  and then _chosen_. If one ever needs a photograph it should become a
  `RegularPicture` like the other four records, not grow the fields in place.
- **`Location` stores only its county; the state is derived.** `Location.state`
  is a read-only property over `county.state`, flattened onto the payload as
  `state`/`state_name`/`state_en_name`/`state_slug` - the same reasoning as
  `Species.kind` over `category.kind`. It is **not writable**, and there is no
  `state` column: two FKs could disagree, one cannot. The accepted cost is that
  a place whose county is unknown carries no state either.
- **The two FKs differ on purpose.** `County.state` is required and `PROTECT`
  (deleting a state still in use is a 409, like a category that still has
  species); `Location.county` is optional and `SET_NULL` (merging a county away
  must not take the places filed under it, exactly like `parent`).
- **There is no `map_link`, and it should not come back.** Every place carries
  coordinates and the CMS has a map picker for setting them, so the site draws
  its own map instead of linking out to someone else's.

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

- `SightingMapSerializer` drops the prose, the gallery and the field conditions,
  and adds `species_icon` / `category_icon` - the glyph a marker is _drawn as_,
  which the feed has no use for. Pinning a category through the feed would ship
  every photo caption of every entry on the map.
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

**A video file cannot go that route** - it is far past that limit, and base64 in
a JSON body would hold the whole thing in memory as a string. Uploaded video has
its own multipart endpoint, `POST /api/journal/sightings/<pk>/media/video/`,
which Django streams to a temp file. Three limits have to agree, and they are in
three different places:

| Limit       | Where                                     | Value  |
| ----------- | ----------------------------------------- | ------ |
| Application | `MAX_VIDEO_UPLOAD_MB` (settings / secret) | 200 MB |
| nginx       | `proxy-body-size` in `helm/values.yaml`   | 256m   |
| gunicorn    | `GUNICORN_TIMEOUT` in `helm/values.yaml`  | 600    |

⚠ nginx refuses an oversized body **before Django sees it**, so raising
`MAX_VIDEO_UPLOAD_MB` alone just turns a readable 400 into an opaque 413.

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
- **List keys include the resolved disabled-visibility**, never the raw
  `include_disabled` param - otherwise an admin response containing drafts is
  replayed to the next anonymous caller. There is a test for exactly that.
  ⚠ The CMS asks for `?include_disabled=true` on **every** list, so this is not
  a corner case any more - it is the path every authoring page takes.
- **Every resource is addressable by pk _and_ by slug** (`/slug/<slug>/`, spelled
  with the literal so a numeric slug can never be read as a pk). The public site
  uses slugs; both are cached, under distinct keys, and a write clears the old
  slug's key as well as the new one's.
- **Sightings paginate** (`{count, limit, offset, results}`, capped at 100); the
  catalog lists return bare arrays. The feed grows without bound - the catalog
  does not.

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
| `State`                                                   | counties (`state_name`/`slug`) **and** locations, which flatten the state read _through_ the county - two tables away from the row that changed |
| `County`                                                  | locations (`county_name` and the state behind it), and states (`county_count`, `location_count`)                                                |

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
GET    /api/catalog/seasons/
GET    /api/catalog/weather-conditions/
GET    /api/catalog/states/                         ?slug= ?search=
GET    /api/catalog/counties/                       ?state= ?state_slug= ?slug= ?search=
GET    /api/catalog/locations/                      ?parent= ?place_type= ?county= ?state= ?featured=
GET    /api/journal/sightings/                      ?species_slug= ?kind= ?location_slug= ?season_slug=
                                                    ?year= ?month= ?date_from= ?date_to= ?limit= ?offset=
GET    /api/journal/sightings/map/                  ?category_slug= ?kind= ?species_slug=
                                                    ?location_slug= ?per_category= ?limit=
GET    /api/journal/stats/                          landing-page headline numbers

# each of the above resources also has:
GET/PATCH/DELETE  .../<pk>/
GET               .../slug/<slug>/

# Photo galleries. GET is public like every other read; the first row is the
# record's cover, so `sort_order` on the PATCH is what picks it.
GET/POST          /api/catalog/categories/<pk>/images/[<img_pk>/]
GET/POST          /api/catalog/species/<pk>/images/[<img_pk>/]
GET/POST          /api/catalog/seasons/<pk>/images/[<img_pk>/]
GET/POST          /api/catalog/weather-conditions/<pk>/images/[<img_pk>/]
GET/POST          /api/catalog/locations/<pk>/images/[<img_pk>/]
PATCH/DELETE      ...the same URLs with an <img_pk>                   admin only

POST/PATCH/DELETE /api/journal/sightings/<pk>/media/[<media_pk>/]     JSON, image or link
POST              /api/journal/sightings/<pk>/media/video/            multipart, video file

# AI authoring - admin only, drafting only (see the LLM section above)
POST   /api/ai/chat/        /api/ai/translate/   /api/ai/copy/   /api/ai/research/
```

Every catalog and journal payload carries **both** languages of each text field
(`name` + `en_name`, …) - see "Bilingual content" above. `?search=` matches
either language.

`?include_disabled=true` is honoured for administrators on every list, ignored
for everyone else. The CMS sends it on every list read, which is how an author
sees a draft they have not published yet.

## Tests

`python manage.py test` (108 tests: `catalog`, `journal`, and `core` for the AI
endpoints, the permission model, the site-settings endpoint and the backup
round-trip - the AI tests always mock the provider, so the suite spends nothing
and needs no network). Inherit
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
- **No trip/outing grouping.** A day out is currently N separate sightings that
  share a date and a location.
