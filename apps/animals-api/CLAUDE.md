# animals-api - Django Conventions

The backend for `apps/animals`, a **nature field journal**: a catalog of what can
be observed (animals, plants, fungi, seasons, weather) plus a dated, located,
illustrated entry for every time something actually was.

It follows `website-api`'s conventions - read that CLAUDE.md for the Caching
Rule, the full-stack coverage rule and the image-size rule, which all apply here
unchanged. This file covers only what is **different**, and the reasons.

## The three differences from website-api

| | website-api | animals-api |
| --- | --- | --- |
| Tenancy | multi-tenant; every model FKs to `System` and every query is scoped by host | **single site.** No `System`, no host resolution, no `X-Website-Host`. Do not add one. |
| Authoring | a bespoke CMS at `/admin` in the Next.js app | **the Django admin is the CMS.** The frontend is a public journal with no admin UI. |
| Write permission | `IsSystemAdmin` (a `UserProfile.is_admin` flag) | **`IsStaffUser`** (`core/permissions.py`) - Django's own `is_staff`, the same flag that opens the admin. There is no `UserProfile.is_admin` here. |

Because the Django admin is the authoring surface, `catalog/admin.py` and
`journal/admin.py` are **product surfaces, not debugging aids**: fieldsets,
`prepopulated_fields`, `autocomplete_fields`, inlines and thumbnails are there so
an outing is quick to type up. Keep them that way when you add a field.

## Apps

- **`core`** - shared plumbing, no models of its own beyond the abstract picture
  bases. `image_sizes.py`, `permissions.py`, `serializers.py` (base64 image
  processing + `Base64ImagesMixin`), `views.py` (the generic cached views),
  `cache.py`, `fields.py`.
- **`catalog`** - the reference data: `Category`, `Species`, `SpeciesImage`,
  `Season`, `WeatherCondition`, `Location`.
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

## Coordinates: two rules that are easy to get wrong

- **A sensitive location blurs coordinates for _everyone_, staff included.**
  `Location.hide_precise_location` rounds the published latitude/longitude to two
  decimals (~1 km) in both `LocationSerializer` and `SightingSerializer`. It is
  **not** conditional on who is asking, because these payloads are cached under
  one key per resource: a staff-only precise variant would be written into the
  same cache and then served to the next anonymous visitor. Staff who need the
  exact spot read it in the Django admin. Never make this per-user without
  splitting the cache key first.
- **Coordinates are published as JSON numbers**, not DRF's decimal-as-string -
  every map library takes numbers. They are the one exception; other decimals
  (temperature) keep the string form. A sighting with no coordinates of its own
  falls back to its location's, so `latitude`/`longitude` on a sighting payload
  are the *effective* values, not the stored column.

## Images ride in JSON, video does not

Every image is a **base64 string in a JSON body**, processed by
`ImageProcessingSerializer` and capped by `DATA_UPLOAD_MAX_MEMORY_SIZE` (10 MB) -
the same pattern as website-api. Write serializers declare their images through
`Base64ImagesMixin`, which validates them up front, writes them *after* the row
exists (the filename embeds the pk), and treats an explicitly empty value as
"clear it" while an omitted one leaves the stored file alone.

**A video file cannot go that route** - it is far past that limit, and base64 in
a JSON body would hold the whole thing in memory as a string. Uploaded video has
its own multipart endpoint, `POST /api/journal/sightings/<pk>/media/video/`,
which Django streams to a temp file. Three limits have to agree, and they are in
three different places:

| Limit | Where | Value |
| --- | --- | --- |
| Application | `MAX_VIDEO_UPLOAD_MB` (settings / secret) | 200 MB |
| nginx | `proxy-body-size` in `helm/values.yaml` | 256m |
| gunicorn | `GUNICORN_TIMEOUT` in `helm/values.yaml` | 600 |

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

- **GET public, writes staff-only**, via `get_permissions`.
- **List keys include the resolved disabled-visibility**, never the raw
  `include_disabled` param - otherwise a staff response containing drafts is
  replayed to the next anonymous caller. There is a test for exactly that.
- **Every resource is addressable by pk *and* by slug** (`/slug/<slug>/`, spelled
  with the literal so a numeric slug can never be read as a pk). The public site
  uses slugs; both are cached, under distinct keys, and a write clears the old
  slug's key as well as the new one's.
- **Sightings paginate** (`{count, limit, offset, results}`, capped at 100); the
  catalog lists return bare arrays. The feed grows without bound - the catalog
  does not.

## Cache invalidation

The rules are website-api's. What is specific here is *what embeds what*, and it
lives in `catalog/signals.py` and `journal/signals.py` with a table at the top of
each. The pairings that bite:

| Writing this | Also stale |
| --- | --- |
| `Category` | every species payload (`category_name`/`slug`/`kind`), the `/kinds/` nav, sightings |
| `Species` | every category payload (`species_count`), the `/kinds/` nav, sightings |
| `Sighting` | that species (`sighting_count`, `last_seen`), the season / weather / location lists (each carries `sighting_count`), and `/journal/stats/` |
| `SightingMedia` | that sighting - its payload embeds the gallery, **and** its cover image falls back to the first photo |

⚠ **Add a derived or flattened field to a serializer and you must add its
receiver in the same task.** A stale count looks exactly like a lost write.

Note one deliberate divergence: `core/cache.py`'s `invalidate_pattern` falls back
to `cache.clear()` when the backend has no `delete_pattern` (LocMemCache, i.e.
development and tests). website-api silently skips there, which leaves an edit
invisible for the whole 5-minute TTL on a laptop. Redis has `delete_pattern`, so
the fallback never runs in production.

## Endpoints

All public on GET, staff-only on write.

```
GET    /api/catalog/kinds/                          the five branches + counts
GET    /api/catalog/categories/                     ?kind= ?featured= ?search= ?slug=
GET    /api/catalog/species/                        ?kind= ?category= ?category_slug= ?featured= ?search=
GET    /api/catalog/seasons/
GET    /api/catalog/weather-conditions/
GET    /api/catalog/locations/                      ?parent= ?place_type= ?country= ?featured=
GET    /api/journal/sightings/                      ?species_slug= ?kind= ?location_slug= ?season_slug=
                                                    ?year= ?month= ?date_from= ?date_to= ?limit= ?offset=
GET    /api/journal/stats/                          landing-page headline numbers

# each of the above resources also has:
GET/PATCH/DELETE  .../<pk>/
GET               .../slug/<slug>/

POST/PATCH/DELETE /api/catalog/species/<pk>/images/[<img_pk>/]
POST/PATCH/DELETE /api/journal/sightings/<pk>/media/[<media_pk>/]     JSON, image or link
POST              /api/journal/sightings/<pk>/media/video/            multipart, video file
```

`?include_disabled=true` is honoured for staff on every list, ignored for
everyone else.

## Tests

`python manage.py test catalog journal` (56 tests). Inherit
**`core.tests.IsolatedMediaTestCase`** for anything that writes: it redirects
`MEDIA_ROOT` to a temp directory and clears the cache between tests. Without the
first, test uploads scatter through the developer's own `media/`; without the
second, one test's cached list is served to the next.

Locally the `.env` points Redis and Postgres at the cluster, so run with
`REDIS_PASSWORD='' DB_PASSWORD=''` to stay on SQLite + LocMemCache.

## Not built yet

Deliberately out of scope so far - decide before adding, do not assume:

- **No translations.** `apps/animals` ships five locales, but the catalog has no
  `en_*` field pairs (website-api's two-language shape does not scale to five).
  Content is single-language until a strategy is picked.
- **No comments, likes or follows.** It is a journal, not a network.
- **No trip/outing grouping.** A day out is currently N separate sightings that
  share a date and a location.
