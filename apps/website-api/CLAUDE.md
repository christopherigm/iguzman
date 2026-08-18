# website-api - Django Conventions

## Caching Rule

Always use `django.core.cache.cache` to cache model data in API views and clear it on mutations.

### Caching GET responses

```python
from django.core.cache import cache

CACHE_TTL = 300  # 5 minutes

def get(self, request):
    cache_key = f"myapp:mymodel:{pk}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
    # … query …
    data = MySerializer(instance, context={"request": request}).data
    cache.set(cache_key, data, CACHE_TTL)
    return Response(data)
```

For list endpoints whose results vary by query params, derive a stable key from the sorted params (see `_list_key` in `catalog/views.py`).

### Cache invalidation on mutations

```python
def patch(self, request, pk):
    # … update …
    cache.delete(f"myapp:mymodel:{pk}")
    _invalidate_pattern("myapp:mymodels:*")
    return Response(data)

def delete(self, request, pk):
    cache.delete(f"myapp:mymodel:{pk}")
    _invalidate_pattern("myapp:mymodels:*")
    return Response(status=status.HTTP_204_NO_CONTENT)
```

Use this helper in every `views.py` and `admin.py` that does pattern-based invalidation:

```python
def _invalidate_pattern(pattern):
    """Delete all keys matching a glob pattern (Redis only; silently skipped on LocMemCache)."""
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        pass
```

### Admin cache invalidation

Override `save_model` and `delete_model` in every `ModelAdmin` class:

```python
def save_model(self, request, obj, form, change):
    super().save_model(request, obj, form, change)
    cache.delete(f"myapp:mymodel:{obj.pk}")
    _invalidate_pattern("myapp:mymodels:*")

def delete_model(self, request, obj):
    cache.delete(f"myapp:mymodel:{obj.pk}")
    _invalidate_pattern("myapp:mymodels:*")
    super().delete_model(request, obj)
```

**Note:** Call `super().save_model(...)` _before_ invalidating; call `super().delete_model(...)` _after_ invalidating.

### Cross-model invalidation - a signal, not a line in each write path

The rules above only cover a model's _own_ namespace, and that is not enough when
a cached payload embeds a **different** model's data. Writing model A then makes
the cached payload of model B wrong, and nothing in A's write path knows it.

Those cases live in `core/signals.py` and `catalog/signals.py` as
`post_save`/`post_delete` receivers, so one receiver covers the API view, the
Django admin (single _and_ bulk delete), any cascade, and a shell script alike.
Current pairings, each documented at its receiver:

| Writing this                   | Also invalidates                                                      |
| ------------------------------ | --------------------------------------------------------------------- |
| `Brand`                        | `catalog:*` (items embed `brand_name`)                                |
| `*Category`                    | `catalog:<family>*` (items embed `category_name/slug`)                |
| `Product`/`Service`/`MenuItem` | `catalog:<family>_categor*` (`item_count`) **and** the System payload |
| `Branch`                       | the System payload (`branch_count`)                                   |

**The System payload is the one that bites.** `GET /api/system/` is cached for an
hour (`SYSTEM_CACHE_TTL`), and `SystemSerializer` carries `product_count`,
`service_count`, `menu_item_count` and `branch_count` -
counts of models it does not own. The storefront navbar builds its links from
exactly those numbers, so any write that changes one must call
`core.cache.invalidate_system_payload()`. **If you add another derived field to
`SystemSerializer`, add a receiver for whatever it counts in the same task**, or
the navbar will be up to an hour stale and look like a lost write.

## Models - Full-Stack Coverage Rule

When adding a **new model** or a **new field to an existing model**, automatically do all of this in the same task:

1. **`admin.py`** - register the model (or add the field to `list_display` / `fields` / `readonly_fields`).
2. **Serializer** - create or update a DRF serializer for the model/field.
3. **View** - create or update the corresponding API view.
4. **URL / endpoint** - wire the view into the router or `urlpatterns`.

**Exception - sensitive fields:** If a field is user-sensitive (passwords, raw tokens, emails, PII), **stop and ask the user** before exposing it in `admin.py` or any endpoint.

Examples requiring confirmation before exposure:

- `password`, `hashed_password`, any password-adjacent field
- `email`, `phone_number`, `date_of_birth`, or other PII
- `token`, `secret`, `api_key`, `refresh_token`

## Tests - keep the suite small

**Do not write a test per assertion, and do not add a test class per feature.**
The suite is a safety net, not a specification. In August 2026 it had grown to
**520 tests across 8,355 lines** — one case per assertion, a class per feature —
and the cost had stopped being the runtime and become the _authoring_: every
small change came with a dozen near-identical tests to write and then to keep
passing. It was condensed to ~135, and it must stay near that.

**The default for a new feature is _one_ test.** A second only when the feature
has a genuinely separate failure mode. Ask "what breaks, and would this test
notice?" — not "is every branch covered?".

Where a new test does belong:

| Add a test when…                                 | Not when…                                             |
| ------------------------------------------------ | ----------------------------------------------------- |
| Money can be wrong (a price, a total, a refusal) | A field round-trips through a serializer              |
| One tenant could reach another's rows            | A getter returns what was just set                    |
| A permission or ownership check exists           | The happy path already asserts it two lines earlier   |
| A cached payload can go stale after a write      | The framework already guarantees it (a `ChoiceField`) |
| A bug was found in production                    | You want to "document" how the code works             |

**Merge, don't multiply.** A single test may make many assertions and walk
through several states — that is the intended shape here, and every existing
class is written that way. Read one before adding to it: the pattern is a long
test with commented sections, not five short ones. If you are about to write
`test_x_when_a` and `test_x_when_b`, they are one test with two assertions, or a
loop over `(input, expected)` pairs.

**Two areas keep full fidelity, and thinning them is not a cleanup:**

- **Money** — `orders/tests.py`: checkout, the Stripe webhook's idempotency,
  deposits, the coupon redemption ceiling, the stock draw-down. Every distinct
  failure mode still has an assertion, because each one is a real charge.
- **The tenant boundary** — every "another tenant's X is a 404 / is not linked /
  cannot be bought". These are security boundaries; they are collapsed into
  fewer test _methods_, never into fewer _cases_.

Each module's docstring restates this. Run the whole suite with
`REDIS_URL='' python manage.py test` (the local `.env` points Redis at the
cluster); it should stay under about half a minute.

## Image sizes - the serializer decides, not the model

**`core/image_sizes.py` is the single source of truth for stored dimensions.**
Model tiers (`picture_mixin()`) and write serializers both read their numbers
from it. Never type a size literal at either site.

The reason is a trap that already cost us: **`ResizedImageField` does not run on
API uploads.** `ImageProcessingSerializer.save_to_field` calls
`FieldFile.save(...)`, which writes to storage and sets `_committed = True`;
`ResizedImageField.pre_save` only resizes when `not file._committed`, so it
always skips. `seed_site._attach` writes the same way. The model tier therefore
only applies to uploads through a **Django admin form** - for everything else the
serializer's `max_size` is the one and only size that is ever applied, and the
smaller of the two numbers silently wins with nothing in the logs. That is how
every CMS-uploaded `CompanyHighlight` came to be stored at 512 px in a field
declaring 1200.

When adding an image field, follow this:

```python
# models.py - tier from the shared constants
class Thing(RegularPicture):     # -> image_sizes.REGULAR
    ...

# serializers.py - the SAME tier, or the file is stored at the wrong size
_THING_IMAGE_CFG = image_cfg(REGULAR)
```

Two more things `image_cfg` encodes:

- **`max_size` is a bounding box on both axes**, while the model tier is a max
  _width_. A portrait image is capped by its height, so a REGULAR portrait comes
  out ~800 px wide, not 1200. Size the tier for the taller dimension.
- **`force_format` defaults to None**, which keeps PNG/WEBP uploads in their own
  format and converts everything else to JPEG - a PNG is usually a logo or
  screenshot, and re-encoding one as JPEG rings every hard edge. Pass it
  explicitly only for fields that must always be one format regardless of the
  upload: `System.img_logo`/`img_favicon`/`img_manifest_*` and `Brand.logo` force
  PNG because they need an alpha channel. `save_to_field` rewrites the caller's
  file extension to match what was actually written, so pass a base name without
  one when the format is not fixed.

Re-encoding is destructive and the original is never kept: fixing a size only
affects **future** uploads, and existing rows have to be re-uploaded in the CMS.

## Publishing a site's content (dev → prod)

`core/site_payload.py` is the portable serialize/apply layer for a `System`'s
content (stories, highlights, product/service catalog). It backs the **publish**
flow that moves a locally-seeded, tested site into production:

- `export_site <host>` (management command) → `serialize_system` dumps the System
  - children to a brief-shaped JSON payload with real slugs. Each record carries
    `image_file` — the storage-relative **name** of its image, never the bytes.
    `--images <zip>` additionally writes those files into a companion archive.
- `POST /api/publish-site/` (`PublishSiteView`, `BasicAuthentication` +
  `IsAdminUser`, mirroring `SystemListView`) → `apply_payload` upserts the System
  by host and every child by slug. `{"reset": true}` wipes the System's prior
  content first. The view invalidates the system + catalog + stories/highlights
  cache namespaces afterward (see the Caching Rule above).

**Images: two body shapes, one rule.** The endpoint takes plain JSON (text only —
every image field on the target is left untouched, the historical behaviour) or
`multipart/form-data` with a `payload` part and an `images` part (the zip from
`export_site --images`). With an archive, `attach_image` **fills an image only
where the target has none**; a record that already has one keeps it. That is
what stops a customer's CMS upload being clobbered by a re-published typo fix,
and it is why `--reset` is the only way a published image is ever replaced (it
deletes the row rather than overwriting the file).

- ⚠ **The stored file is re-named to its basename on the way in.** The source
  path is namespaced by the _dev_ tenant's id (`t/<system_id>/…`), and reusing it
  would file the photo under whatever System happens to hold that id in
  production. `upload_to` re-derives the right prefix from the target row.
- **A missing archive member is skipped, not raised.** Storage is remote and a
  row can outrun its upload; publishing 58 of 60 photos and saying so beats a 500.
- **`_ARCHIVE` is a `ContextVar`, not a module global** — gunicorn runs `gthread`
  workers, and two tenants publishing at the same instant would otherwise read
  each other's zip. The failure mode is one customer's site wearing another's
  photographs, which is the worst thing this feature could do.

## Stock photography and the credit it owes

`/seed-site` fills a new customer's brief from a free stock bank
(`fetch_seed_images` → `core/services/image_banks.py`: Pexels, falling back to
Pixabay). Both license commercially, which is what lets a seeded photo publish
and go live rather than being a placeholder the customer must replace.

- **`BasePicture.attribution` / `attribution_url`** hold the credit, on every
  picture model in the schema in one migration. Two fields for the same reason
  `map_attribution` / `map_attribution_url` are two: a bank's terms ask for a
  visible credit **and** that it point back at them, so one string could only be
  plain text or anchored at a guessed href. `System` spells out its own pair for
  `img_hero` / `img_about` — its other images are the customer's own mark and can
  never come from a bank.
- ⚠ **The content licences waive attribution; the API terms do not.** Downloading
  the same photo by hand would owe nothing. Pulling it through the API owes a
  credit, which is why this is stored rather than discarded at seed time.
- **A non-empty `attribution` is the marker for "still a stock photo."**
  `core/stock_images.py` counts them into `SystemSerializer.stock_image_count`,
  which gates the storefront footer's bank credit and drives the CMS's
  replace-these nudge. Its model list is derived from `core.backup.MODEL_SPECS`
  (the one registry that already states every model's ORM path to its System),
  never hand-listed — and `core/signals.py` registers the payload-invalidating
  receiver against every one of those models the same way.
- **`_apply_attribution` in `core/serializers.py` settles the credit for the file
  just written**, from inside `save_to_field` — the one place every CMS image
  upload passes through. It takes the `(attribution, url)` pair a bank photo owes,
  or `None` for a customer's own upload, which owes nobody and so **clears** the
  row's credit. ⚠ It persists itself with its own `UPDATE` because every caller
  saves with `update_fields=["image"]`, which would silently discard an in-memory
  change; the symptom would be a customer's own photograph still credited to a
  stranger. Removing an image entirely is deliberately not covered: it
  over-credits, which is the harmless direction.
- **The CMS searches the same banks, through this API** —
  `POST /api/stock-images/search/` returns the hits for a query and
  `POST /api/stock-images/fetch/` downloads the one that was picked, as a
  base64 data URL plus its credit (`StockImageSearchView` /
  `StockImageFetchView`, both `IsSystemAdmin`). The frontend holds no bank
  credential, exactly as it holds no LLM or Stripe key.
  - ⚠ **Fetch takes a bank and an id, never a URL.** A view that fetched a
    client-supplied URL would be an open proxy into the pod's network, and would
    let whoever chose the image also choose the credit that goes with it. Both
    are re-read from the bank instead.
  - **Every write serializer behind a CMS image field takes the credit**, via
    `StockCreditWriteMixin` (`core/serializers.py`): the categories, the three
    buyables, the four gallery-row serializers, the two editorial ones and
    `Ingredient`. A serializer opts in by mixing it in — a `ModelSerializer` also
    listing `*StockCreditWriteMixin.CREDIT_FIELDS` in its `Meta.fields` — and
    passing `pop_credit(...)` straight into `save_to_field`.
  - ⚠ **The credit rides _into_ `save_to_field`; it is never set beside it.**
    That call is what clears a stale attribution (see the bullet above), so a
    pair the serializer wrote itself would be wiped by the very write that stores
    the file it describes. `pop_credit` also drops a credit sent **without** an
    image — there is no new file for it to describe, and honouring it would let a
    caller re-credit a photo it did not supply.
  - ⚠ **The mixin subclasses `Serializer`, which it looks like it should not.**
    DRF's `SerializerMetaclass` inherits declared fields only from bases that
    already carry `_declared_fields`, so as a plain mixin its two fields are
    silently ignored by every `Serializer` subclass — while a `ModelSerializer`
    still builds them from the model, which is exactly the sort of half-working
    that hides the mistake. It goes **first** in the bases so its fields survive
    the MRO.
- ⚠ **The keys are no longer local-only.** They were, while `fetch_seed_images`
  was the only consumer and seeding never ran in the cluster. The CMS picker does
  run there, so `PEXELS_API_KEY` / `PIXABAY_API_KEY` belong in
  `website-api-secrets` (`pnpm secrets`) as well as in a developer's `.env`.
  With neither set, the search endpoint answers **503 `NO_IMAGE_BANK`** and the
  CMS tells the operator which key is missing rather than looking broken.

Tests: `StockImageTests` in `core/tests.py` (one test each for the count, the
publish-image transport, and the fetch -> seed -> upload chain),
`StockImagePickerApiTests` beside it for the two picker endpoints, and
`StockImageCreditTests` in `catalog/tests.py` — one test over the three *write
shapes* a CMS image field has (a category's `ModelSerializer`, a buyable's plain
`Serializer`, a gallery row created from its parent) rather than one per model.

Driven by `pnpm publish-site <host>` (`cli/website/website.sh publish`). `seed_site`
imports `SYSTEM_TEXT_FIELDS` from `site_payload` so seeding and publishing agree
on which System fields are copyable content.

## Media storage - Cloudflare R2, routed per tenant (`core/storage.py`)

**Production stores media in Cloudflare R2, and only there.** Every upload,
image and backup archive alike, goes to a bucket and is served from the CDN.
`settings.py` picks the `STORAGES['default']` backend off `R2_ACCOUNT_ID` and
nothing else in the codebase branches on the environment.

With `R2_ACCOUNT_ID` unset, files go to `MEDIA_ROOT` on local disk with no
Cloudflare account and no network calls — that is **development and tests only**,
so `runserver` and `manage.py test` need no credentials, and it must stay that
way. It is **not** a production fallback: see the warning below.

There are **two levels of bucket**. The platform bucket (`R2_*` env vars) is the
default for every tenant. A customer on its own domain can connect **its own R2
account** in the CMS (`/admin/system` -> Storage), and then its files live in its
bucket and serve from its CDN hostname.

- **A file finds its bucket by its own name.** Every upload path is
  `t/<system_id>/…` (`core/tenant_paths.py`), and `TenantMediaStorage` reads the
  tenant back out of the path on every operation. It cannot come from anywhere
  else: `FileField.storage` is resolved **once at model-class load**, so a
  `storage=` callable can never be per-row, and `url()` is called from
  serializers, management commands, email builders and the Django admin - most
  with no request, some rendering _another_ tenant's rows, so a thread-local
  "current tenant" would be right most of the time and silently wrong exactly
  where a wrong answer writes a real file into someone else's bucket. A path
  with no prefix is legacy and resolves to the platform bucket.
- **`system_id_for()` reads `MODEL_SPECS`**, which already states every model's
  ORM path to its `System` and is kept honest by the backup engine. Adding a
  model there gives it tenant-scoped storage with no edit in `tenant_paths.py`.
- **The per-tenant config is memoised per process for `CONFIG_TTL_SECONDS` (60).**
  `url()` runs once per image per page render and must not be a query. A
  credential change therefore reaches other gunicorn workers within a minute; the
  worker that handled the save is cleared immediately by the `post_save` receiver
  in `core/signals.py`. **The memo holds the secret still encrypted** - it
  outlives the request, and a plaintext R2 key in a long-lived process dict buys
  nothing over decrypting once per backend build.
- **An incomplete config is _no_ config.** All of enabled + account + key +
  secret + bucket must be present or the tenant stays on the platform bucket; a
  half-filled form must not start writing somewhere unreachable. Undecryptable
  ciphertext (another environment's, or after a key rotation) also falls back
  rather than raising - the alternative is a 500 on every page with an image.
- **The credential follows the Stripe rules exactly** (`core/crypto.py` Fernet,
  `write_only`, no read path, `""` clears, the CMS omits it to leave unchanged).
  It is excluded from backups (`SYSTEM_EXCLUDE`) and from `SystemAdmin`. The
  other four storage fields are readable, but only through the admin-only
  `GET /api/system/<pk>/storage/` - **never** add them to `SystemSerializer`,
  which is `AllowAny` and feeds every public page. `POST` to the same URL
  round-trips the credentials (write, read back, delete) so a typo fails in the
  CMS instead of on a customer's next upload.

⚠ **The hostPath volume is gone, and so is the way back.** Media used to live on
a `/shared-master` volume on a cluster node, published by an nginx sidecar under
`/media/`. Every site has been migrated into R2 and all of that - the volume, the
sidecar, its `^~ /media/backups/` deny rule, the `/media/` ingress path, and the
`core/media_sync.py` copier that did the migration - has been removed from the
chart and the codebase. The pod is stateless now: **an empty `R2_ACCOUNT_ID` in
the cluster does not fall back to disk, it silently throws uploads away** on the
next rollout. All five `R2_*` variables come from the Secret and are deliberately
absent from `env:` in `values.yaml` (see "Production env & secrets" below).

**Connecting a tenant's own bucket still moves nothing**, and there is no longer
a tool that would. Stored paths are strings: an unprefixed legacy name resolves
to the platform bucket forever, and a `t/<system_id>/…` name written before the
switch stays in whichever bucket it was written to. Only _future_ uploads land in
the newly connected bucket, so a tenant that switches has its media split across
two buckets - both serving, nothing broken. Moving them is a manual `rclone`
job plus a database repoint, not a CMS button.

⚠ **The bucket is public, and that includes backup archives.** A Cloudflare
custom domain serves every object in its bucket and has no notion of an ACL -
which is what makes images fast, and what removes the nginx `^~ /media/backups/`
deny rule that used to be a backup's second lock. What remains: the uuid4 in
`backup_upload_path`, `SiteBackupSerializer` never exposing `file`, and
`SiteBackupDownloadView` being the only code that produces a URL for one. **To
restore a real second lock, add a Cloudflare WAF rule on the public hostname
blocking `/t/*/backups/*`** - this code only ever uses the S3 endpoint, so the
rule costs nothing.

`MEDIA_URL` is now absolute in production, which broke every
`f"{MEDIA_BASE_URL}{file.url}"`. Use **`core.media.absolute_media_url()`** in any
context with no request (branded emails); `request.build_absolute_uri(file.url)`
needs no change - it returns an already-absolute URL untouched.

## Tenant backup & restore (`core/backup.py`)

`core/backup.py` is the **tenant-facing** backup layer behind `/admin/system` in
the CMS: a tenant downloads its own data and images as a zip, and can upload one
to write it back. It is **not** `site_payload.py` and the two must not be merged —
they have opposite contracts. `site_payload` is the dev→prod _publish_ layer and
is lossy on purpose (truthy fields only, no images, never touches image fields on
update) so re-publishing cannot clobber what a customer edited. A backup must
reconstruct the tenant exactly, so it carries **every** concrete field of every
row plus the media files.

Archive layout: `manifest.json` (format version, host, sections, counts),
`data.json` (`{"<app>.<model>": [rows]}`), and `media/` at storage-relative paths.

- **Rows are built by introspecting `_meta.concrete_fields`, not by hand-listed
  field tuples.** `site_payload` and `import_site` both list fields explicitly and
  both have drifted from the models. What `MODEL_SPECS` states is only what
  introspection cannot know: a model's section, its ORM path to `System`, and
  what identifies a row across databases. **Adding a field to a model needs no
  edit here** — but adding a whole _model_ does.
- **Secrets never travel.** `System.stripe_*` (Fernet ciphertext, useless in
  another environment and a credential leak in a downloadable file) and
  `User.password` are excluded; a restored account gets an unusable password and
  must reset. Never add either to the exported field set.
- **Slugs are globally unique; tenants are not.** `update_or_create(slug=...)`
  would hand one tenant another's row, so every lookup is scoped to the target
  System first and a key owned by a different System is skipped, never taken over.
  Same rule for `auth.User`, which is global while tenancy lives on
  `UserProfile.system`.
- **`auto_now` / `auto_now_add` are re-applied with a follow-up `QuerySet.update()`.**
  Django overwrites them on `save()`, so without this every restored order would
  claim it was placed at the moment of the restore.
- **Each row is its own savepoint, and the `try` sits _outside_ the `atomic()`
  block.** Catching a database error inside one leaves the savepoint to be
  released on a connection Postgres has already aborted, and every later row then
  fails with "current transaction is aborted".
- **Restore refuses an archive whose manifest host is not the target tenant's**,
  and the whole apply runs in one transaction — a failure part-way leaves the
  site as it was. `mode` is `replace` (wipe the selected sections and rebuild) or
  `merge` (upsert, leaving unmentioned rows alone); the CMS lets the operator pick.

⚠ **An archive is served with no authentication in front of it**, and it is the
tenant's whole database — customer accounts and order history included. The R2
bucket it sits in is published by a Cloudflare custom domain. What keeps them
private: `backup_upload_path` gives each file a uuid4 name,
`SiteBackupDownloadView` — which matches the row against the caller's own System —
is the only sanctioned read path, and `SiteBackupSerializer` deliberately does
not expose `file` (publishing that URL would route around all of it).

The `^~ /media/backups/` deny rule the old nginx sidecar carried was the second
lock, and it went with the sidecar; it **has no equivalent on R2** — a custom
domain serves every object in its bucket and R2 has no per-object ACLs. Add a
Cloudflare WAF rule blocking `/t/*/backups/*` on the
public hostname to get one back; this code only ever reads through the S3
endpoint, so the rule costs nothing. See the storage section above.

Endpoints (all `IsSystemAdmin`, all scoped to the caller's own `System`):
`GET/POST /api/backups/`, `DELETE /api/backups/<pk>/`,
`GET /api/backups/<pk>/download/`, `POST /api/backups/restore/` (multipart).
Building and restoring are synchronous, which is why the ingress carries
`proxy-body-size: 0` and 600s read/send timeouts and gunicorn's `--timeout` is 600. Tests are in `core/tests.py` (`SiteBackupTests`, `SiteBackupApiTests`) — they inherit `IsolatedMediaTestCase`, which redirects
`MEDIA_ROOT` to a temp dir so test fixtures and archives do not scatter through
the developer's own `media/`.

## Payments - per-tenant Stripe, and the rules around it

This is a **multi-tenant** payments stack: every `System` connects its **own
Stripe account**. There is deliberately **no project-wide `STRIPE_SECRET_KEY`** -
if you find yourself reaching for one, the design has been misread.

- **Credentials live on `System`, encrypted at rest.** `stripe_secret_key` and
  `stripe_webhook_secret` are Fernet ciphertext (`core/crypto.py`, ported from
  `cinelog-api/core/crypto.py`); `set_stripe_*()` encrypts, the same-named
  property decrypts. `STRIPE_CREDENTIALS_ENCRYPTION_KEY` is the only global knob,
  and **rotating it (or `SECRET_KEY`, which it falls back to) orphans every
  stored credential** and silently breaks checkout for every tenant.
- **The secrets have no read path, anywhere.** They are `write_only` on
  `SystemWriteSerializer` and `exclude`d from `SystemAdmin`. `GET /api/system/`
  is `AllowAny` and feeds every public page, so **never** add
  `stripe_secret_key_encrypted` / `stripe_webhook_secret_encrypted` to
  `SystemSerializer.fields` - it would hand every tenant's ciphertext to anyone
  who asked. `stripe_configured` is the only thing the API will say about them.
- **The webhook is the only thing that may mark an order paid.** The browser's
  return to the success URL is a plain redirect - forgeable, replayable, and
  often never followed. `StripeWebhookView` must stay idempotent: Stripe retries
  on any non-2xx and can double-deliver.
- **The webhook URL is per system**
  (`/api/orders/stripe/webhook/<stripe_webhook_token>/`), because each tenant's
  account signs with its own secret. A single shared endpoint would have to try
  every tenant's secret against every event and could not tell a forgery from a
  mis-routed delivery. The order lookup is scoped to the verified `System` for
  the same reason.
- **That path uses `System.stripe_webhook_token`, not the pk, and not `host`.**
  Not the pk because the tenant is shown this URL in the CMS to paste into
  Stripe, and the pk would hand it every other tenant's addressable id. Not
  `host` because host is editable on that same CMS page: a tenant renaming its
  domain would silently unhook its endpoint, and payments would stop being
  confirmed with nothing in the logs to say why. The token is opaque, immutable
  and unique - but it only **routes**. It is not a credential (it appears on the
  AllowAny `GET /api/system/`); the signature is what authenticates.
- **Return URLs come from `System.host`, never from a request header.**
  `X-Website-Host` is client-settable; using it for `success_url` would make
  checkout an open redirect on the tenant's own domain.
- **Checkout is `AllowAny`, and `Order.user` is nullable.** A guest's cart
  arrives as **references** in the body and is priced by `resolve_guest_cart`
  (`users/guest.py`) into _unsaved_ `CartItem` instances; both branches then run
  the same `_checkout`. The body never names an amount. An anonymous caller is
  scoped by `host_system` (a signed-in one always by profile - never let a
  header pick a logged-in user's tenant). `GET /api/orders/<public_id>/` is
  likewise `AllowAny`, but `_may_read` only opens up orders with **no** user;
  DELETE stays owner-only.
- **`POST /api/orders/<public_id>/pay/` reopens checkout on an order that
  already exists**, for the customer who reached Stripe and came back without
  paying. It charges the order's own frozen lines - no cart, no amount in the
  body - and only the webhook still marks anything paid, so an abandoned second
  attempt costs nothing. Two rules hold it together: **only a `pending` online
  order qualifies** (a `canceled` one is also what a _tenant_ refusing an order
  writes, and what the webhook writes on expiry - neither may be undone from a
  browser), and **an order must never carry two payable sessions at once**. The
  second is why `_existing_session` reuses a still-open session rather than
  opening another, and calls `expire_session` when it cannot read the old one:
  with two live sessions a customer can pay both, and `_handle_completed` -
  idempotent on an order already `paid` - would acknowledge the second charge
  instead of refusing it. Stock and (for a booking) slot availability are
  re-derived before the session, since the order has been sitting unpaid.
  `AllowAny` behind `_may_read`, like `OrderDetailView`. Tests: `OrderPayTests`,
  `OrderPayBookingTests`.
- **Guest orders are claimed by email, and only once Stripe has supplied one.**
  `orders/claims.py` runs at email verification and at login. `Order.email` is
  blank until the webhook copies what the customer typed on Stripe's page, so an
  abandoned guest order has no address for someone to register and sweep up.
- **`OrderLine` snapshots; `CartItem` deliberately does not.** A cart reflects
  today's catalog; an order must reflect what was charged, forever. Never
  "simplify" an order line to read its price back through the FK - those FKs are
  `SET_NULL` provenance and go null when the catalog item is deleted.
- **Amounts go to Stripe in minor units** via `to_minor_units()`. CLP is in
  `CURRENCY_CHOICES` and is zero-decimal: a bare `* 100` overcharges 100-fold.
- A mixed-currency cart is **refused** (`MIXED_CURRENCY`), not converted - a
  Checkout Session is single-currency and `Buyable.currency` is per item.

Tests live in `orders/tests.py` and cover the parts that cost real money:
idempotent redelivery, cross-tenant events, unpaid-but-completed sessions,
signature rejection, and the snapshot surviving a price change. Run them with
`REDIS_URL='' python manage.py test orders` (the local `.env` points Redis at the
cluster).

## Coupons - a discount code, redeemable a limited number of times

`orders.Coupon` is a campaign a tenant runs: **one coupon is one code**
("SUMMER20", 20% off, redeemable 50 times, expiring on the 31st), not a batch of
single-use codes. That is what makes the QR on a poster meaningful - everyone who
scans it gets the same offer, and `max_redemptions` is what stops it running
forever. A per-customer single-use code would be a child row per issued code, and
this model deliberately does not pretend to be both.

The engine is **`orders/services/coupons.py`**, and every path that can discount
an order goes through it - the signed-in checkout, the guest one, the POS till,
and the advisory "is this code good?" call the cart makes. Same reason
`_open_order` is shared by all of them: two copies of "is this coupon still
valid?" would eventually disagree, and the first symptom would be a code the cart
accepted being refused at the moment of payment.

- **The discount is order-level**: a percentage or a fixed amount off the cart
  subtotal, never a per-item rule. That is also the only shape that maps onto a
  single session-level Stripe discount without inventing per-line rounding.
- ⚠ **`redeem_coupon` is the only place `times_redeemed` moves, and it must stay
  a single conditional UPDATE.** Two customers checking out at the same instant
  both pass `validate_coupon`; a read-modify-write would let both take the 50th
  of 50 redemptions and store 50 either way. The `filter(times_redeemed__lt=...)`
  on the queryset is what makes the check and the increment one statement the
  database resolves serially - `.update()` returning 0 means someone else won.
- ⚠ **Validation is not a reservation, and losing the race is a refusal.**
  `apply_coupon_to_order` raises `COUPON_EXHAUSTED` rather than writing the order
  at full price. The alternative is worse than it looks: a customer quoted 160
  and charged 200 is a surprise on the Stripe page and, at a counter, an
  associate reading one number off the till while the receipt prints another.
  Callers discard the half-built order (`_discount_order`) and return the code.
- ⚠ **A dead order has to hand its redemption back**, exactly as it hands back a
  booking slot - the redemption is taken optimistically when checkout opens.
  `_release_order_coupon` does it on an expired session, a failed payment and a
  CMS cancel, and the two `order.delete()` branches around Stripe call
  `release_coupon` directly. Drop any of them and an abandoned checkout quietly
  burns a redemption the tenant meant to sell with. `release_coupon` is floored
  at zero with the same conditional-UPDATE shape, so a double-delivered webhook
  cannot drive a `PositiveIntegerField` negative and fail a webhook that has
  nothing else wrong with it.
- **Stripe gets a one-off `amount_off` coupon, never a `percent_off`**
  (`create_discount_coupon`), applied at the **session** level so the line items
  stay at the prices the order recorded and the customer sees a named discount.
  `Order.discount_amount` is the number that was computed, shown and stored;
  asking Stripe to re-derive a percentage of its own subtotal invites the two to
  disagree by a cent, at which point nothing reconciles. It is `duration: once`
  with a `redeem_by` an hour out, so a tenant's dashboard does not fill with one
  coupon row per discounted sale.
- ⚠ **A failed Stripe coupon creation must refuse the checkout, not proceed.**
  The line items are at full price, so going ahead without the discount object
  charges the undiscounted total against an order that records the discounted
  one. `_checkout` deletes the order, releases the redemption and returns
  `COUPON_ERROR`.
- ⚠ **`discount_coupon` is ignored alongside `charge_amount`.** That path
  collapses the basket into a single amount for a booking _deposit_, and a
  discount on top of a partial charge takes it off the deposit rather than the
  order - discounting the same money twice once the remainder is collected.
  Bookings do not take coupons today, and this is what keeps that explicit rather
  than silently wrong.
- **The code is matched case-insensitively**, and the unique constraint is on
  `Upper("code")` per system - the customer is typing off a poster on a keyboard
  that auto-capitalises, and two rows differing only in case would race for the
  same redemptions with whichever one the query returned owning them.
- **`Order.coupon` is `SET_NULL` and `coupon_code`/`discount_amount` are
  snapshots**, exactly like `OrderLine`. Deleting a finished campaign must not
  erase the record of the discounts it gave, and a percentage re-applied to
  today's subtotal would drift from what was actually charged.
- **A fixed-amount coupon is refused in another currency** rather than converted -
  the same rule that refuses a mixed-currency cart, for the same reason: we have
  no rate. A percentage carries no currency and applies to any basket.
- **The discount is clamped to the subtotal.** A 500-off coupon on a 300 basket
  discounts 300: a negative total is not a refund, it is a Stripe session that
  cannot be created.
- **`attach_coupon_qr` deletes the old file before writing**, unlike the order QR
  which is written once and left alone forever. A coupon's code is editable and
  the PNG encodes a URL built from it, so a rename has to re-render - and storage
  backends do not overwrite, they suffix (`<public_id>_wTGsKbw.png`), so without
  the delete every save orphans the previous PNG in the bucket.
- **The QR is named after `public_id`, not `code`** - a tenant fixing a typo in
  the code would otherwise orphan the file that is already on a printed flyer.
  Unlike an order's QR this file is _meant_ to be public; there is nothing here
  to guess your way into.
- **`brand_logo_background` + its two scales are stored** alongside
  `template_id`, mirroring `SocialPost`'s trio (same choices, same 30-100
  bounds, same "none draws it bare" default) so a flyer and a post stay
  recognisably one brand. They are columns while the flyer's _backdrop_ upload
  deliberately is not: a backdrop decorates one exported JPG, but the logo
  lockup is how the coupon looks every time it is re-downloaded.

Endpoints: `POST /api/coupons/validate/` and `GET /api/coupons/<code>/` are
`AllowAny` (a visitor scans a poster before they have any reason to sign in, and
is scoped by `X-Website-Host`); `/api/coupons/admin/` and
`/api/coupons/admin/<pk>/` are `IsSystemAdmin`, scoped to the caller's own System.
**None of them are cached**, deliberately: `times_redeemed` moves on every
checkout, so a cached "still available" outliving the last redemption is the one
wrong answer that costs a customer a wasted trip to the cart. Same exception an
individual order already carries. The public landing serves the narrow
`CouponPublicSerializer` - what the offer _is_, never how the campaign is
performing - and answers 200 with `valid: false` for an expired coupon rather
than 404, so the page can say "this offer has ended" for a code the tenant really
did print.

Tests: `CouponTests` in `orders/tests.py`.

## Bookings - a Service sold as an appointment

A `Service` with `booking_enabled` is sold as a scheduled appointment instead of
a cart line. The storefront drops "Add to cart"/"Buy now" for "Book now", which
leads to a scheduling checkout.

**A booking is not a parallel kind of purchase.** `orders.Booking` hangs off an
ordinary `Order` (OneToOne) carrying one service line, which is what lets it
inherit the whole existing machine: Stripe sessions and the signed webhook, guest
orders addressed by `public_id`, `claim_guest_orders`, the confirmation emails,
`/orders` history and `/orders/<public_id>`. A standalone booking aggregate would
have needed a second implementation of every one of those.

- **`Booking.status` is the appointment axis; `Order.status` is the money.** They
  move independently, exactly as `Order.fulfilled` already does against
  `Order.status`. A booking can be `confirmed` on an order that is still
  `pending`, and a pay-in-person booking is never paid online at all. The CMS
  actions (`confirm`/`complete`/`cancel`) never touch payment - `complete` does
  set `Order.fulfilled`, because for an appointment the work and the handover are
  the same moment.
- ⚠ **The one direction that must not stay independent: an order that dies has to
  release its appointment.** The booking is written _before_ the redirect to
  Stripe and is born `pending`, which is in `ACTIVE_STATUSES` - so it occupies its
  hour from the moment checkout starts (deliberately: two customers must not be
  sent to Stripe for the same slot). But `_occupancy` reads `Booking.status`
  alone and never looks at the order, so `checkout.session.expired`,
  `async_payment_failed` and the CMS's order-level `cancel` release _nothing_ on
  their own. All three call `_release_booking(order)` in `orders/views.py`; drop
  it and a customer who backs out of the Stripe page leaves that hour blocked
  forever - blocked hardest for themselves, since the slot they wanted is the one
  slot they can no longer rebook. `BookingCheckoutView`'s `StripeGatewayError`
  branch is the same rule in its harshest form: it deletes the order outright
  rather than leave a booking that can never be paid. Covered by
  `AbandonedBookingTests`.
- **`orders/services/booking.py` is the single availability authority.** The
  public availability endpoint the calendar paints from and the checkout that
  writes the booking both call `slots_for_day`, so the times a customer is shown
  and the times the server accepts cannot drift. **Never write a second, "quick"
  overlap check inline in a view** - that is how a customer ends up staring at a
  slot that refuses itself on submit. Checkout re-derives the slot through
  `is_slot_available` rather than trusting the request: the calendar in front of
  the customer may be minutes old.
- **Hours are local wall clock; instants are UTC.** `BranchHours` stores
  `TimeField`s that mean whatever `Branch.timezone` says, which is what keeps
  "we open at 9" correct across a daylight-saving change. Django runs on
  `TIME_ZONE='UTC'`, so a branch with a wrong timezone opens at the wrong hour
  and nothing else will catch it. `Booking.timezone` is a **snapshot** for the
  same reason `OrderLine` snapshots its price - re-rendering a past appointment
  through a branch that has since moved zones would be rewriting history.
- **A weekday with no `BranchHours` row is closed.** There is deliberately no
  `is_closed` flag: absence _is_ the closure, so there is one state where there
  could be two. `BranchWriteSerializer` takes the whole week under `hours` and
  **replaces** it; a per-day endpoint would let a save half-fail and leave a
  branch open on days the operator had just closed.
- **Capacity lives on the Branch, not the Service.** What it counts is people or
  rooms, which every service at that location shares - per-service capacity would
  let three different services each book the only chair at 10am. Only
  `Booking.ACTIVE_STATUSES` occupy a slot, so a cancellation hands the time back
  immediately.
- ⚠ **Capacity is counted in _seats_, not in bookings.** It used to be bookings,
  and the two only agree while every booking is for one person. `Booking.party_size`
  is the unit now: a party of four consumes four seats and its order line carries
  `quantity=4`, which is what makes the price (and the deposit split, which works
  off `order.total`) multiply. `Branch.booking_capacity` kept its name and changed
  its meaning; its `help_text` says so.

### Party size and resource pools

Two models on `core` describe what a branch actually books against:
`ResourcePool` ("Large boats", "Guides") and `BookingResource` (one boat, with a
`capacity` in people). `Service.booking_party_enabled` decides whether a service
is sold per person at all.

- ⚠ **The fallback is the whole safety story.** A branch with **no pools**
  resolves to one implicit resource carrying `Branch.booking_capacity`
  (`resources_for`), which reproduces the pre-pool behaviour exactly - at party
  size 1, summing seats is arithmetically identical to counting overlapping rows.
  Every existing tenant is unaffected and all of this is opt-in. **Do not
  "clean it up" into a data migration that gives every branch a real pool**: the
  implicit case has to keep working for a branch created tomorrow too.
- **One row per resource that differs in capacity or that a customer can pick by
  name.** Six identical eight-seat tables are _one_ row with `capacity=48`, not
  six - the engine only tells parties apart from each other, and six rows would
  refuse a party of ten that four of those tables could seat together. Two boats
  of different sizes are two rows, because which one a party of six lands on is a
  real question.
- **Assignment is automatic, best fit, at write time.** Of the resources that can
  take the whole party, `assign_resource` picks the one with the _least_ room
  left. That consolidates (two half-full boats become one) and so preserves the
  large free blocks large parties need; first fit does the precise opposite.
  Staff may reassign afterwards from the CMS.
- **A party never splits across two resources.** `seats_left` in the availability
  payload is therefore the largest free block on a _single_ resource, never the
  sum - two boats with three seats each answer "no" to a party of six.
- ⚠ **A booking with a null `resource` is charged to _every_ resource.** Rows
  written before pools existed carry no assignment and there is no way to know
  which boat they are on; counting them against only the (now absent) implicit
  resource would drop them from the arithmetic and oversell every real one. The
  charge is conservative rather than exact, and self-heals as those appointments
  age out of the active statuses.
- **`Service.booking_pools` empty means _every_ pool at the resolved branch**, the
  same rule `booking_branches` follows. The two compose rather than fight: pools
  are always filtered by the branch, so a pool at a location this service is not
  offered at is never reachable.
- ⚠ **`booking_party_limit` is on `ServiceDetailSerializer`, never on the list
  one.** It walks pools and resources per service - an N+1 across a catalog grid.
  The card only needs the `booking_party_enabled` boolean, which is why that is
  the one party field on `ServiceSerializer`. **But which serializer runs is
  decided by the query, not by the endpoint**: `?slug=` on
  `/api/catalog/services/` is the storefront's _detail_ read - `getService(slug)`
  has no other route to one service - so it matches at most one row and gets
  `ServiceDetailSerializer`. Served with the list one it dropped the party
  bounds, and the booking page's counter (gated on `max > min`) never rendered
  while its heading priced a party of `NaN`. Pinned by `ServiceSlugReadTests`.
  And it is an **upper bound, not a
  promise**: capacity differs per branch and it says nothing about who is already
  booked, so the detail page uses it as a static ceiling while the booking page
  does the real filtering from the availability payload.
- **`party_size` is validated, never clamped.** A body naming a party outside
  `booking_party_range` is refused with `PARTY_SIZE_INVALID` - clamping would
  charge a customer for a different number of people than they asked for. Party
  off forces 1 whatever the body says. `resource` is only honoured when its pool
  is `customer_selectable` and reachable from the resolved branch, and is a
  _preference_: a pick that has since filled up falls through to best fit rather
  than failing the booking.
- ⚠ **Checkout holds a row lock.** `assign_for_slot` and the `Booking` write run
  inside one `transaction.atomic()` with a `select_for_update` on the Branch (the
  System for a branchless tenant). Un-serialised, two checkouts can both see the
  last four seats free and both take them - a window that was one row wide when
  capacity counted bookings, and a real over-sell now that a party of six can walk
  into it with money attached. **Stripe stays outside the block**, and so does the
  QR write (`_open_order(defer_qr=True)`): a network round-trip under a row lock
  would queue every checkout at that branch behind a third party.
- **A service add-on may be priced, never scheduled.** If something needs its own
  availability, it is a service, not an add-on. There is deliberately no second
  scheduling primitive.
- ⚠ **The old "2 x haircut at 10:00 is two bookings, not a quantity" reasoning is
  reversed for party services, and the comment at the `CartItem` line says why.**
  Both readings are right, for different things: an _appointment_ is one person's
  turn in a chair, and booking two of them is two separate slots a single quantity
  cannot express. A _departure_ - a boat, a tour, a table - is one slot several
  people share, priced per head. `booking_party_enabled` is which of the two a
  service is.
- **`core/backup.py` keys pools and resources rather than riding them as
  `parent=` children**, unlike `BranchHours`. `BranchHours` has no identity, so
  replacing a branch's week wholesale is indistinguishable from editing it; a
  `BookingResource` is pointed at by `Booking.resource` (`SET_NULL`), so wholesale
  replacement would null the boat on every appointment - or re-point it at the
  wrong one. Same reason `BranchWriteSerializer._save_pools` **upserts by id**
  instead of the replace-all `hours` uses.
- **`orders/signals.py` drops the availability namespace on pool, resource,
  branch and branch-hours writes too**, not just Booking writes. Editing a boat
  from ten seats to eight has to reach the calendar now, not whenever the next
  booking happens to clear it.
- **`Service.duration` is load-bearing** once resources exist: with three boats
  and a four-hour tour, what stops boat 1 being booked at both 10:00 and 11:00 is
  the duration overlap - and `service_duration_minutes` silently falls back to 60
  when it is null. The CMS warns when booking is on and duration is empty.
- **The duration also spaces the start times** (`slot_step_minutes`): a two-hour
  tour is offered at 09:00 and 11:00, not every half hour. ⚠ **There is no
  per-branch grid setting, and adding one back is a regression.**
  `Branch.booking_slot_minutes` was a fixed 30-minute grid for every service at
  the location, which printed a row of start times that deleted each other the
  moment one was taken (with one boat, booking the 09:00 kills the 09:30);
  `core.0058` made it a nullable override and `core.0061` removed it outright.
  It was the wrong shape twice over: one number had to serve a 30-minute trim
  and a 4-hour tour alike, and it was a second source of truth beside the
  duration it could only disagree with. A service whose starts should be closer
  together than its length is asking for a shorter `Service.duration`.
  `slot_step_minutes(service)` therefore takes **no branch**, and
  `_branch_settings` carries no slot key - spacing is a property of the service,
  and never passes through the branch.
- ⚠ **`Branch.timezone` defaults to `"UTC"`, and a branch left on it is broken
  rather than neutral.** Opening hours are read against that zone, so a Los Cabos
  branch on UTC opens at 02:00 local, labels every slot in the wrong zone, and
  loses same-day booking for most of the working day (its "now" is seven hours
  ahead of the shop's). Nothing 500s and nothing warns; the calendar just looks
  oddly empty. The CMS branch form now seeds a _new_ branch with the operator's
  own zone for exactly this reason - check this field first whenever a tenant
  reports missing or wrongly-timed slots.
- ⚠ **A branchless tenant has one implicit seat.** `_branch_settings(None)` returns
  `capacity: 1` and there is no UI to raise it, so a home business that turns on
  party bookings gets a counter capped at 1. That is arithmetically correct - one
  seat cannot hold four people - but it is a configuration dead end: creating a
  Branch and setting its capacity is the fix, and the CMS's party section shows
  the ceiling it is working from.
- **`Service.booking_branches` empty means _every_ branch**, not none - see
  `branches_for`. An unconfigured bookable service must still be bookable. A
  tenant with no `Branch` rows at all is the home-business case: the booking
  carries `branch=None` and follows the defaults in `_branch_settings`.
- **Read `booking_payment_options` / `booking_fulfillment_options`, never the raw
  switches.** The model properties own the fallbacks (all payment switches off →
  pay in person, neither fulfillment on → at a branch), so the storefront and the
  checkout cannot disagree about what is on offer.
- **A deposit is not a discount.** `create_checkout_session(charge_amount=...)`
  collapses the basket into one line for the amount due now; the order still
  records the service at full price, and `Booking.amount_due_later` is what the
  tenant collects. The split is computed once, in `_booking_amounts`, with the
  remainder taken as the difference so the two halves always sum back to the
  total. An order whose session was created this way is **not** paid in full when
  the webhook lands.
- **Availability is the one cached payload with a 60s TTL** (`AVAILABILITY_CACHE_TTL`),
  and `orders/signals.py` drops the whole namespace on any Booking write. The
  short TTL is a floor under bursts, not a correctness mechanism - checkout
  re-derives the slot, so the worst a stale calendar can do is offer a slot that
  is then honestly refused.
- `availability_range` fetches occupancy **once for the whole range**, and the
  pools/resources once too. The endpoint is public and unauthenticated; a query
  per day would be a denial-of-service handed out for free, which is also why
  `days` is clamped to `MAX_AVAILABILITY_DAYS` and `party` to `MAX_PARTY_SIZE`.
- ⚠ **`availability_key` includes `party` and `resource`.** Both change which
  slots come back, so leaving either out would serve a party of six the calendar
  computed for a solo customer for up to a minute. Cardinality grows by
  party × resource, which is trivial at a 60s TTL - do not "optimise" them back
  out of the key.

Endpoints: `GET /api/bookings/availability/` and `POST /api/bookings/checkout/`
are `AllowAny` (a visitor books before they have any reason to sign in - an
anonymous caller is scoped by `X-Website-Host`, a signed-in one always by
profile); `/api/bookings/admin/` and `/api/bookings/admin/<pk>/` are
`IsSystemAdmin` and scoped to the caller's own System. Tests are in
`orders/tests.py` (`BookingAvailabilityTests`, `BookingCheckoutTests`,
`BookingAdminTests`) - they pin `now` to a fixed instant rather than reading the
clock, because "is this slot in the future" is half of what the engine decides.

## Order QR codes (`orders/services/qr.py`)

Every order stores a PNG QR code (`Order.qr_code`) encoding its **public**
detail URL, `https://<tenant host>/orders/<public_id>` - the same address the
confirmation email already links to. It exists so a store admin can scan the
emailed or printed code at the counter and land straight on the order to
validate it.

- ⚠ **The code points at the customer page, never at
  `/admin/orders/<public_id>`.** A QR carries exactly one URL and it is printed
  on paper the customer keeps, so it has to be the address that works for
  whoever holds it. Admin validation is a _permission_ on that page, not a
  second code - which is why `_may_read` grew its third rule (below) and why the
  frontend puts a "See in admin" button on the customer page.
- **`_may_read` lets a tenant's admin read any order of their own System.**
  They can already see every one of them through `AdminOrderDetailView`, so this
  grants no new data; it only lets the customer-facing endpoint answer for them.
  The tenant boundary is enforced _upstream_, not here: every caller filters on
  `request_system(request)` first and a signed-in user's System always comes from
  their profile (`core/tenancy.py`), so an admin cannot reach another tenant's
  order at all.
- ⚠ **`OrderPayView` uses `_may_pay`, which deliberately drops that admin rule.**
  Reopening checkout expires the order's live Stripe session before opening
  another, so an admin who scanned a QR while the customer was mid-payment on
  their phone would kill the session under them. Validating an order is a read;
  paying for one is not. Don't collapse the two predicates back together.
- **Written once, at checkout** (`_open_order`, outside the transaction so a
  round-trip to object storage never holds a row lock), never regenerated per
  render: the payload derives only from `public_id` and the tenant's host,
  neither of which moves, and a printed code that regenerated differently would
  stop matching the receipt it is on. **Best-effort** like the order emails -
  a storage failure logs and leaves `qr_code` blank rather than costing the sale,
  so **every render site must handle a null code**. Fill gaps (and every order
  placed before the field existed) with `python manage.py backfill_order_qr
[--host <host>] [--force] [--dry-run]`.
- **The order email embeds the code as an inline `cid:` attachment**, unlike the
  logo and the product thumbnails in the same message: most clients block remote
  images by default and a blocked QR is a blank box, which for the one thing the
  recipient may hold up at a counter is worse than no code. That needs
  `message.mixed_subtype = "related"` - without it the image is a sibling of the
  whole body rather than of the HTML and several clients refuse to resolve the
  cid.
- **`site_base_url` is shared with the Stripe return URL** (`_site_base_url` in
  `orders/views.py` is now an alias) for the same reason it always had: the
  origin comes off `System.host`, never from a client-settable header - this one
  ends up printed on a receipt.
- ⚠ **The stored file is as public as the link it encodes.** `order_qr_upload_path`
  names it after the `public_id` and the R2 bucket is served by a Cloudflare
  custom domain with no ACLs, so the unguessable id is the only lock - exactly as
  it is in the URL. Never "tidy" the name to a sequential id, which would put
  every other order's code one guess away from the last.

Tests: `OrderQrTests` in `orders/tests.py`, plus the admin-read cases in
`OrderReadTests` and `OrderPayTests`. ⚠ That module now sets `MEDIA_ROOT` to a
temp dir via `setUpModule` - every checkout in it writes a real file, and
unisolated they scatter a PNG per order through the developer's own `media/`.

## Catalog kind labels - four columns on `System`

`kind_label_<kind>` / `en_kind_label_<kind>` hold what a tenant calls the two
Buyable families it can sell, `product` and `service`. `core.models.CATALOG_KINDS`
is the list and `KIND_LABEL_FIELDS` the derived column pairs, imported by the read
serializer, the write serializer, `SystemAdmin` and `SYSTEM_TEXT_FIELDS` so those
four cannot list different sets. The frontend resolution rules are in
`apps/website/CLAUDE.md`.

- **A menu has no labels here.** It is sectioned by the tenant's own
  `MenuCategory` rows, which are already their own copy - renaming a menu section
  is editing the category. This used to be _fourteen_ columns: the two families
  plus the five `MenuItem.kind` values. `catalog.0037` removed the enum and
  `core.0066` removed its ten columns; see "Menu sectioning" below.
- ⚠ **They rename a label and nothing else.** Every storefront URL is structural -
  never derive one from a label, and never validate anything against one.
- **Public by design**, unlike the credentials they sit near: they are on
  `SystemSerializer` because every storefront heading is painted from them.
- **Nullable with no default, and blank is meaningful** - it is how a tenant
  hands a family back to the frontend's own translation. A default would have to
  be written in one language and would be wrong on the four locales the model
  stores no copy for.
- `SystemSettingsTests` in `core/tests.py` pins `CATALOG_KINDS` to the two
  families, and pins the write serializer's hand-declared fields against
  `KIND_LABEL_FIELDS`.
- They are in `SYSTEM_TEXT_FIELDS`, so they travel with `export_site` /
  `publish-site` and can be set from a `seed_site` brief - they are copy decided
  once when a site is written, with no per-environment id in them.

## Menu sectioning - the category, and nothing else

A `MenuItem` belongs to exactly one `MenuCategory`, and **`category` is
required**. That one relation is the whole sectioning story: it groups
`/categories/menu`, fills the navbar's Menu dropdown, and is the first segment of
every item's public URL (`/menu/<category>/<slug>`).

It used to be sectioned twice. `MenuItem.kind` was a five-value enum
(food/drink/dessert/side/appetizer) that sat beside the optional category and
drove a `?kind=` filter, five listing pages, five detail routes and ten
`System` label columns. Two sectionings of one menu can only ever disagree, so
the enum is gone (`catalog.0037`).

- ⚠ **`category` is `on_delete=CASCADE` and required**, unlike its optional
  `Product`/`Service` counterparts - so **deleting a category deletes every menu
  item in it**. That is deliberate (there is no "no category" state for a row to
  fall back to), but it makes a category delete far more destructive than a
  product-category one. `MenuItemCategoryTests` pins it.
- **`MenuItemWriteSerializer.category` has no `required=False`**, so a create
  with no category is a 400 rather than a row the storefront cannot address.
- **`MenuItemVariantSerializer` carries `category_slug`**, and
  `OrderLineSerializer` carries `item_menu_category_slug` - both are the first
  segment of a link to a page that still exists, so both are read live through
  the FK rather than snapshotted. ⚠ Anywhere `lines__menu_item` is prefetched,
  `lines__menu_item__category` must be too, or the order page is an N+1.
- ⚠ **The item's URL is therefore mutable**: re-filing a dish in the CMS moves
  it. The frontend keeps a slug-only permalink (`/menu/<slug>`) that resolves and
  redirects, which is what should be handed out when an address has to outlive an
  edit.
- **The `catalog.0037` migration files every previously-uncategorized item into a
  per-System "Otros" category** before setting the column `NOT NULL` - Postgres
  refuses `SET NOT NULL` otherwise. Deliberately _not_ derived from the old
  `kind`; operators re-file from the CMS.

## Menu sizes - one model, two owners, a signed delta

`catalog.MenuSize` is a size a dish is offered in ("Chica 4 in", "Grande 12 in"),
priced as a **signed** `price_delta` off the item's base price. It replaced the
older workaround of modelling sizes as a `MenuItemIngredient` single-select
choice group, which could only ever _add_ to the price and put a diameter in the
same list as extra cheese.

Sizes are authored per **`MenuCategory`** - a pizzeria's pizzas come in five and
its drinks in two, and neither list belongs on the individual dish - and a
`MenuItem` may carry its own rows to **replace** that list. One model serves both,
distinguished by which owner FK is set (exactly one, `CheckConstraint`), so the
API, the CMS editor and the customer's picker are one implementation rather than
a category copy and an item copy that would drift.

| Piece              | Where                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| Model + resolution | `catalog/models.py` (`MenuSize`, `MenuItem.effective_sizes` / `resolve_size`) |
| Serializers        | `catalog/serializers.py` (`MenuSizeSerializer`, `MenuSizeWriteSerializer`)    |
| Endpoints          | `catalog/views.py` (`_BaseMenuSize*View` + the two owner pairs)               |
| Cache invalidation | `catalog/signals.py` (`invalidate_menu_on_size_change`)                       |
| The chosen size    | `users.CartItem.menu_size` (live) -> `orders.OrderLine.size_*` (snapshot)     |

- ⚠ **`MenuItem.effective_sizes` is the only place the inherit/override rule
  lives, and it is resolved server-side.** `sizes` on the menu-item payload is
  _already_ "own rows if any, else the category's, empty when `sizes_enabled` is
  off" - the storefront, the catalog card and the POS till all read that one
  answer. Re-deriving it in three clients is how a dish comes to show one list on
  its detail page and another at the counter.
- **Own rows _replace_ the category's entirely, never merge.** That is the only
  rule that lets an edge-case dish **drop** a size its category offers (a
  personal-only calzone on a menu whose pizzas come in five sizes); a merge could
  only ever add. It is also why `MenuItem.own_sizes` is deliberately _not_ named
  `sizes`: a property and a related manager sharing one name is how a caller ends
  up reading an empty override and concluding the dish has no sizes.
- ⚠ **`MenuSize.system` is derived in `save()`, never authored** - and it is not
  denormalisation for speed. Every mechanism that scopes a model to its System
  takes exactly **one** ORM path (`core.backup`'s `ModelSpec.scope`, and through
  it `core.tenant_paths.system_id_for`, which decides which R2 bucket a row's
  image is written to). A two-way `category__system` / `menu_item__system` cannot
  be that one path: an item-level override resolves to None on the category branch
  and its picture silently lands in the platform bucket instead of the tenant's.
- **`price_delta` is signed, and the total is floored at zero.** Signed so a
  tenant prices "pizza" once at its regular size and states that small is −40 and
  large is +40; a size list that could only add would force the _smallest_ size to
  be the base and quote every real size as an up-charge, which is not how a menu is
  written. Floored because a delta bigger than the base is a misconfiguration, not
  a refund.
- ⚠ **Size does not scale the ingredient up-charges.** Extra cheese costs the same
  on a small as on a large. One pricing axis, deliberately: a multiplier would have
  to be applied identically in `price_for_selection`, in the storefront customiser
  and in the till, and the first disagreement between them is a price on screen
  that is not the price charged. A dish that genuinely needs per-size add-on
  pricing is two dishes.
- **`resolve_size` never trusts an id**, exactly like
  `MenuItemIngredient.resolve_option`: a size that is stale, forged, or belongs to
  another dish prices as the **default**, so a crafted request buys nothing.
  `default_size` is the row flagged `is_default`, falling back to the first in
  display order - which is what keeps a list where nobody set the flag resolvable
  rather than sizeless.
- **The write serializer clears `is_default` on the row's siblings.** Rows are
  PATCHed one at a time by the CMS editor, so nothing else could; the model
  tolerates two (first in order wins) but the CMS would then show two filled
  radios, which reads as a lost save.
- ⚠ **A size is part of a cart line's _identity_.** `CartItem.menu_size` is
  CASCADE like `menu_item` (a cart reflects today's catalog; silently re-pricing a
  withdrawn size at another one is the alternative), and `_add_menu_line` merges on
  size **and** customization - a small and a large are two lines, not one of
  quantity 2. `users/guest.py`'s `_dedupe_key` carries the same rule for a guest.
- **`OrderLine` snapshots `size_name` / `size_en_name` / `size_price_delta`**, like
  every other displayable fact on it. The delta is already inside `unit_price`; it
  is stored so the line reads back as base + size rather than as one number that
  does not reconcile against the catalog.
- **The list endpoints are the _own_ rows, not the effective list.**
  `GET /api/catalog/menu-items/<pk>/sizes/` is empty for the ordinary dish that
  inherits - only the CMS editor reads it. What a customer is offered is `sizes` on
  the menu item payload.
- ⚠ **A category-level size write invalidates the whole `catalog:menu_item*`
  namespace**, because which dishes inherit it is not something the receiver can
  enumerate cheaply - and a dish still offering a size the tenant just retired is a
  price the customer can still select. That lives in `catalog/signals.py`, not in
  each write path, so the API views and the admin's two inlines are covered alike.
- **Sizes travel** with `export_site` / `publish-site` (`core/site_payload.py`,
  keyed by owner + `sort_order` like a menu-item ingredient, since a size has no
  slug), with a tenant backup (`core/backup.py`, keyed by `created` like
  `core.Branch` - it hangs off two possible parents, so `_restore_children`'s
  single named parent cannot serve it), and from a `/seed-site` brief
  (`_seed_sizes`). ⚠ In all three an **inheriting dish must arrive still
  inheriting**: exporting the resolved list would turn every dish into an
  overriding one and detach it from its category on the far side.

Tests: `MenuSizeTests` / `MenuSizeEndpointTests` (`catalog/tests.py`),
`CartMenuSizeTests` (`users/tests.py`), `OrderLineSizeSnapshotTests`
(`orders/tests.py`), and the publish round-trips in `core/tests.py`.

## Deleting a shared ingredient a dish still uses

`MenuItemIngredient.ingredient` and `MenuItemIngredientOption.ingredient` are both
PROTECT, so `DELETE /api/catalog/ingredients/<pk>/` is refused while any dish
still points at the row. That refusal is right - pulling an ingredient out from
under a dish changes what is being sold - but on its own it was a dead end: the
CMS could only say "still in use" and leave the admin to find every dish by hand.
`catalog/services/ingredient_usage.py` turns it into a question.

- **The 409 _names_ the blockers.** `{code: "INGREDIENT_IN_USE", usages: [...]}`,
  one entry per referencing row, each carrying the dish, the choice group and the
  `role` the ingredient plays in it: `plain`, `group_default` (the row's own
  ingredient, on a row that has options) or `group_option`. The frontend modal is
  built entirely from that payload - don't collapse it back to a count.
- **The admin's answer is a `?mode=`, and the same DELETE is re-issued with it.**
  `detach` removes the ingredient and keeps the dishes; `groups` deletes every
  `MenuItemIngredient` row that touches it, taking the whole choice group (and its
  other options) with it. No mode is the plain refusal above, so an existing
  caller is unchanged and a delete can never resolve conflicts it was not asked
  to. ⚠ An unrecognised mode is a **400**, not a fall-through to the refusal - a
  typo in an instruction must not be read as "do nothing special and delete".
- ⚠ **`detach` on a group's _default_ promotes, it does not detach.** A choice
  group cannot exist without a default, so the group's first remaining
  alternative moves into the slot, **carrying its own `price`** (price travels
  with the ingredient being charged for, or a premium alternative silently
  inherits the cheap one's up-charge). A group with nothing left to promote is
  deleted - which is why `can_promote` rides on every usage: the CMS says so up
  front rather than surprising the admin with a lost group.
- **Alternatives are deleted; the ingredients behind them are not.** A
  `MenuItemIngredientOption` is a link, and the `Ingredient` it points at is a
  shared catalog record other dishes may use.
- **The view invalidates the affected menu items**, and collects their ids
  **before** running a resolver - afterwards nothing points at the ingredient to
  derive them from.

Tests: `IngredientTests` in `catalog/tests.py`.

## Checkout recommendations - "don't forget these"

`catalog.CatalogRecommendation` is the strip of extras a customer is offered
under their own cart lines: a pizzeria that never mentions a drink sells fewer
drinks. One model backs all of it.

| Piece                    | Where                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| Model + inherit/override | `catalog/models.py` (`CatalogRecommendation`, `RecommendationSource`)   |
| The cart strip           | `catalog/recommendations.py` (`cart_recommendations`)                   |
| Refs + replace-all write | `catalog/serializers.py` (`recommendation_refs`, `set_recommendations`) |
| The CMS read             | `catalog/views.py` (`RecommendationListView`)                           |
| Cache invalidation       | `catalog/signals.py` (`invalidate_on_recommendation_change`)            |
| On the payload           | `users/views.py::_cart_payload` + `users/guest.py::cart_payload`        |

It deliberately resembles `variants` and is shaped differently in three ways,
each of which is the point:

- ⚠ **Directional, not symmetrical.** A pizza recommends a soda; a soda does not
  recommend a pizza. `variants` is symmetrical because _being an alternative
  version of_ is mutual, and _being a suggested extra_ is not - a symmetrical
  relation here would fill every drink's checkout strip with the food it was
  offered beside.
- **Cross-family.** A dish may recommend a `Product` (a bottle of wine, a branded
  mug) and a product may recommend a `Service`, so the source is one of **six**
  things (three items + their three categories) and the target one of three
  families - exactly one column of each, both enforced by a `CheckConstraint`
  built with `_exactly_one` rather than typed out as thirty-six clauses. It is a
  real model rather than nine M2M fields because the pairing carries a
  `sort_order` and an `enabled` switch, and one table is one editor, one
  serializer and one cache receiver instead of nine.
- **Authored per category, overridable per item** (`RecommendationSource`), the
  same rule `MenuItem.effective_sizes` follows: a tenant states "with a pizza,
  offer a soda" **once**, on the Pizzas category. Own rows _replace_ the
  category's entirely and never merge - a merge could only ever add, and could
  not express "this dish recommends nothing".

Six things that will bite:

- ⚠ **The fallback is decided on the presence of _rows_, never on whether their
  targets are buyable today.** A dish whose single own recommendation is out of
  stock recommends nothing; it must not silently start showing its category's
  list, which would read as a lost edit. `offerable_recommendations` filters
  _after_ the choice of list is made.
- ⚠ **What rides on an item's payload is nothing at all - and that is on
  purpose.** `own_recommendations` was briefly a field on the three buyable read
  serializers, which put an N+1 on every cart line and every favorite (those
  payloads nest the full item serializer). The CMS reads its selection from
  `GET /api/catalog/recommendations/?source=<kind>&id=<pk>` instead, exactly as
  `MenuSize` serves a dish's _own_ rows from its own endpoint, and the customer's
  strip is resolved on the cart payload. **Do not add a recommendations field to
  `ProductSerializer` / `ServiceSerializer` / `MenuItemSerializer`** without
  attaching `OWN_RECOMMENDATION_PREFETCH` at every one of their call sites.
- ⚠ **That endpoint answers with _own_ rows, and for an item that is not what the
  customer sees.** An empty answer means "offer whatever my category
  recommends". Serving the resolved list there would show an operator ticks they
  never made, and the first save would freeze them into an override - the trap
  `MenuItem.own_sizes` is named around. It also reports a row whose target is
  out of stock: that row is a record of what the operator chose, and hiding it
  would look like the CMS lost the tick.
- **The strip is four decisions no client could make**, all in
  `recommendations_for_cart`: union-then-dedupe across lines (three pizzas that
  all recommend the same soda offer it once), drop anything already in the cart
  (matched on the **item alone** - a customer holding a Coca in any size has
  taken the "add a Coca" prompt), drop the unbuyable, and drop anything in a
  currency the basket cannot check out in (checkout refuses a mixed-currency
  cart with `MIXED_CURRENCY`, so offering one would invite the customer into a
  basket that cannot be paid for). Capped at `MAX_CART_RECOMMENDATIONS`.
- **It rides on the cart payload rather than having its own endpoint**, which is
  what makes it self-maintaining: every cart write invalidates that payload, so
  adding a recommended item drops it from the next render with no bookkeeping
  anywhere. `users/guest.py`'s copy works on **unsaved** `CartItem` instances
  because `recommendations_for_cart` reads only `kind` / `target`, both model
  properties that never touch the database - the same reason
  `CartItemSerializer` renders both carts.
- ⚠ **A recommendation write clears `users:cart:*`, i.e. every cached cart.**
  Which carts hold a matching line is exactly what the receiver cannot know, and
  a tenant adding a drink to its Pizzas category has to reach everyone currently
  holding a pizza. Only _recommendation_ writes do this: a recommended item going
  out of stock leaves a dead card on a cached strip for up to `CART_CACHE_TTL`,
  the same staleness a cached cart already carries for a price change.

`system` is derived from the source in `save()` for `MenuSize`'s reason (six
possible paths up to a tenant cannot be the one `ModelSpec.scope`). The write
layer replaces a source's whole set and **skips** a target owned by another
System rather than linking it, plus any self-reference; there is deliberately no
unique constraint, because in Postgres a unique index over mostly-NULL columns
enforces nothing. In `core/backup.py` the spec is **last in `MODEL_SPECS`** so
every one of its nine FKs is already in the idmap - see the note there for the
one partial-restore hole that leaves.

Tests: `CatalogRecommendationTests`, `RecommendationEndpointTests`
(`catalog/tests.py`) and `CartRecommendationTests`
(`users/tests.py`).

## Editing a cart line (`PATCH /api/auth/cart/<id>/`)

The cart page lets a customer re-open a dish's customiser on a line that is
already in their basket, so this endpoint takes `size` and `customization`
beside `quantity`. **Every field is optional and only what is sent is applied** -
the quantity stepper and the customiser share the endpoint, and neither may
reset the other's half of the line.

- **It edits in place rather than delete-and-re-add.** A dropped-then-re-added
  line loses its position (`CartItem` is ordered by `-created_at`) and cannot be
  atomic: a failed re-add leaves the customer with no line at all.
- ⚠ **Size and selection are re-resolved exactly as on the add path**
  (`_menu_size` / `_menu_selection`), so an edit naming another dish's size or a
  bogus option prices as the **default**, never at its own. Nothing about this
  path is more trusted for being an edit.
- ⚠ **An edit can collide with a line already in the cart**, since a line's
  identity is the dish plus its size and selection. `_resave_menu_line` is the
  mirror of `_add_menu_line`'s merge: it folds the edited row into its twin and
  deletes it, keeping (and returning) the row the customer did not touch, which
  is the one holding its place in the cart. Without it, editing a large into a
  small while a small is in the basket leaves two lines printing the same thing.
- **`size`/`customization` are ignored on a product or service line** - neither
  has anything to configure.
- ⚠ **`CartItemSerializer.get_customization` carries the chosen `option` id**
  (null when the group's default was kept) alongside the resolved name. The name
  is what the cart _prints_; the id is what the picker _selects on_, and a name
  cannot be turned back into one - without it a re-opened customiser would show
  the customer the default in place of the alternative they actually bought.

Tests: `CartLineEditTests` (`users/tests.py`).

## Maps - the basemap is four columns on `System`

`map_style` / `map_tile_url` / `map_attribution` / `map_attribution_url` decide
which basemap every map on a tenant's site is painted from (the contact page's
locations, an event's venue, the booking page's branch map). The frontend
resolves them once per request; see `apps/website/CLAUDE.md` → "Maps".

- ⚠ **The credit travels with the URL, and neither is decoration.** Every tile
  provider requires a specific attribution string, and it changes with the tiles
  - so these are stored as a set, and `map_attribution_url` is separate from the
    string because most providers also require the credit to _link_ back at them.
    Blank means unlinked, not "default to OpenStreetMap", which is what the
    frontend used to do for every provider alike.
- **The three custom fields are deliberately not validated conditionally on the
  style.** A leftover URL under a built-in style is the normal state of a row
  somebody experimented with, and refusing the save would make the CMS picker
  feel broken for a change that has no effect. The style itself _is_ a
  `ChoiceField`: an unknown id falls back to OSM's standard tiles on the
  frontend, which reads as the setting having been ignored.
- ⚠ **`map_tile_url` is not a secret and cannot be made one.** A provider key
  rides in it as `?key=…`, the tiles are fetched from the visitor's own browser,
  and `GET /api/system/` is `AllowAny` - so the key is public by construction.
  Restrict it by origin at the provider. This is why it is on `SystemSerializer`
  at all, unlike the Stripe and R2 credentials it sits near in the model.

Tests: `SystemSettingsTests` in `core/tests.py`.

### `Branch.map_image` - the one map this API does not draw

A booking confirmation email shows a picture of the location. **That picture is
rendered in the browser, by the CMS's map picker, and uploaded with the
coordinates it belongs to** (`lib/map-capture.ts` in `apps/website`); Django
never fetches a map tile. It cannot: rendering one here would mean six
third-party requests per queued message, from a pod behind a VPN sidecar, under
a tile-usage policy written for interactive maps. The one moment a map of the
place already exists is an operator dropping the pin, so that is where the image
comes from.

- ⚠ **It is a snapshot and can go stale.** Moving the pin re-renders it;
  changing the tenant's brandmark or its basemap does not. That is the trade for
  an image that costs nothing to send.
- ⚠ **`map_image` follows the "omitted means leave it, blank means clear it"
  contract**, like every base64 image field here - and it matters more than
  usual, because the CMS only sends the field when the pin actually moved. Were
  an omitted field to clear the column, a tenant would lose its map the first
  time anyone edited the phone number.
- **`_booking_location` in `orders/services/order_emails.py` is the gate**, and
  `BookingSerializer.get_branch_location` is the same rule for the order page.
  Three conditions: the order is a booking, its `fulfillment` is `branch`, and
  the branch is pinned. ⚠ The middle one is not redundant - an `on_premises`
  booking **does** carry a branch (it is scheduled against that branch's
  calendar), so without it the confirmation for a visit to the customer's home
  would carry a map of the shop.
- **The picture and the Directions link are independent.** The link is built
  from the coordinates, so a location that was pinned before the picker existed
  still gets the useful half. The map is a **remote** `<img>`, unlike the order
  QR beside it: a blocked map costs the reader nothing, while a blocked QR is
  the one thing they may have to hold up at a counter.

Tests: `BookingLocationTests` in `orders/tests.py` (both consumers) and
`BranchWriteTests` in `core/tests.py` (the PATCH semantics).

## LLM calls - always through `core/services/llm.py`

Every AI call in the website stack runs here, not in the Next.js app. `stream_chat`
uses **Groq as primary and OpenRouter as fallback**, mirroring
`cinelog-api/catalog/services/llm.py`. Never call a provider SDK directly from a
view, and never move an API key back into the frontend.

- **The fallback only covers failures before the first token.** Once Groq has
  emitted content the user is already reading it, so restarting on OpenRouter would
  duplicate the output; a mid-stream failure propagates instead. An empty Groq
  stream counts as a failure and does fall back.
- Unlike cinelog's rate-limit-only rule, **any** Groq exception falls back here
  (timeouts and 5xx included), so a Groq outage degrades instead of failing.
- Config: `GROQ_API_KEY`, `GROQ_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
  `LLM_REQUEST_TIMEOUT`. In the cluster both keys come from the
  `website-api-secrets` Secret; locally they come from `.env`, which
  `settings.py` loads via `load_dotenv` (as cinelog-api does). With neither key
  set, `/api/ai/chat/` returns 503 rather than streaming - so a 503 from that
  endpoint means the key never reached the process, not that the provider is down.

`AiChatView` (`POST /api/ai/chat/`, `IsSystemAdmin`) streams OpenAI-shaped SSE for
the admin CMS's enhance/translate buttons. Two rules if you touch it:

- **Set `X-Accel-Buffering: no`.** nginx otherwise buffers the whole completion and
  delivers it in one lump, defeating the streaming UI.
- **Errors must be reported inside the stream** (`data: {"error": {...}}`), because
  `StreamingHttpResponse` commits the 200 before the generator runs. Validate
  anything that could 4xx/5xx _before_ returning the response. Report provider
  errors generically and log the detail - upstream error bodies are not for the
  browser.

Streaming holds its worker for the whole generation, which is why gunicorn runs
`gthread` workers (see the `Dockerfile`) - with plain sync workers, two concurrent
enhance requests would block every other API call.

## Production env & secrets (k8s)

Config reaches the pod three ways, and the order matters:

1. `envFromSecretBundle: website-api-secrets` - every **validly-named** key of the
   Secret becomes an env var. This is how `GROQ_API_KEY` / `OPENROUTER_API_KEY`
   arrive.
2. `env:` in `helm/values.yaml` - non-sensitive config. **`env` beats `envFrom`**
   ([k8s API ref](https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/):
   "Variables defined in the env field take precedence over variables defined in the
   envFrom field").
3. `envFromSecret:` - explicit `secretKeyRef`s for the kebab-case keys
   (`db-password`, `secret-key`, …). These **cannot** come from the bundle: the
   kubelet silently ignores Secret keys that aren't valid env var names.

⚠ **`website-api-secrets` contains a stale trap.** Alongside the live kebab-case
keys it still holds a `--from-env-file` dump of an old `env.example`, in
SCREAMING_SNAKE. Those copies are **wrong**:

| Stale key in Secret | Says               | Reality                                            |
| ------------------- | ------------------ | -------------------------------------------------- |
| `DEBUG`             | `True`             | prod must be `False`                               |
| `ALLOWED_HOSTS`     | `*`                | must be the real host list                         |
| `SECRET_KEY`        | ≠ `secret-key`     | using it rotates the key → **logs every user out** |
| `REDIS_PASSWORD`    | ≠ `redis-password` | using it breaks the cache                          |

They are inert **only** because `env:`/`envFromSecret:` name the same variables and
win. **Never delete an entry from `env:` to "remove duplication"** - that hands
production `DEBUG=True`, `ALLOWED_HOSTS=*` and a rotated `SECRET_KEY`. The real fix
is to prune the stale SCREAMING_SNAKE keys from the Secret (keep only
`GROQ_API_KEY`, `OPENROUTER_API_KEY`, and the kebab-case ones); do that before
simplifying the chart.

⚠ **That same precedence cuts the other way, and it silently disabled R2.** The
chart renders **every** key of `env:` including empty-valued ones
(`helm/templates/deployment.yaml`, `range $key, $value := .Values.env`), so a
placeholder like `R2_ACCOUNT_ID: ''` reaches the pod as a real empty string and
**shadows the Secret's value**. `R2_ACCOUNT_ID` is the single switch for the
whole media stack, so an empty one turns R2 off entirely no matter what
`pnpm secrets` wrote. All five `R2_*` variables are therefore deliberately
**absent** from `env:` and come from the bundle alone. Do not re-add them "for
documentation" - a commented example is fine, a key with a placeholder value is
not. The general rule: a variable that is supplied by the Secret must not also
appear in `env:` unless `env:` is meant to be authoritative for it.

### Updating the Secret: `pnpm secrets`

`pnpm secrets` (`cli/setup-k8s-secrets/setup-k8s-secrets.sh`) is the canonical way.
It reads `apps/<app>/env.example`, derives the Secret name as `<app>-secrets`, lets
you tick individual keys, and **patches only the ticked ones** (`--type=merge`), so
add a key to `env.example` and it becomes offerable with no other change. Use a real
env var name (`MY_API_KEY`) so the bundle picks it up without a chart edit.

Three things to know before running it against production:

- ⚠ **It offers `env.example`'s values as defaults, and Enter accepts them.** This is
  exactly how the stale trap above was created: `DEBUG`, `ALLOWED_HOSTS` and
  `FRONTEND_URL` in the live Secret are byte-identical to this repo's dev defaults.
  Tick **only** the keys you actually intend to set, and type real values.
- **It cannot delete a key** - patch/create only. Pruning the stale keys needs a
  manual `kubectl patch` with a JSON-merge `null`, or recreating the Secret.
- ⚠ **Its "Restart pods?" prompt restarts _every_ Deployment and StatefulSet in the
  namespace** - in `website` that includes `postgres` and `redis`, not just the app.
  Prefer `kubectl rollout restart deployment/website-api -n website`.

A Secret change does **not** reach running pods on its own: env vars are read at
container start, so a rollout restart (or redeploy) is required.
