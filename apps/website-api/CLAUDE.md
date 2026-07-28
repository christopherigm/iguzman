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

| Writing this                   | Also invalidates                                                    |
| ------------------------------ | ------------------------------------------------------------------- |
| `Brand`                        | `catalog:*` (items embed `brand_name`)                              |
| `*Category`                    | `catalog:<family>*` (items embed `category_name/slug`)              |
| `Product`/`Service`/`MenuItem` | `catalog:<kind>_categor*` (`item_count`) **and** the System payload |
| `Branch`                       | the System payload (`branch_count`)                                 |

**The System payload is the one that bites.** `GET /api/system/` is cached for an
hour (`SYSTEM_CACHE_TTL`), and `SystemSerializer` carries `product_count`,
`service_count`, `menu_item_count`, `menu_item_kind_counts` and `branch_count` -
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
  - children to a brief-shaped JSON payload with real slugs. **Image files are
    omitted** — every image is an `ImageField` (a file), not portable data.
- `POST /api/publish-site/` (`PublishSiteView`, `BasicAuthentication` +
  `IsAdminUser`, mirroring `SystemListView`) → `apply_payload` upserts the System
  by host and every child by slug. It **never touches image fields on update**, so
  a customer's CMS-uploaded images survive a re-publish; `{"reset": true}` wipes
  the System's prior content first. The view invalidates the system + catalog +
  stories/highlights cache namespaces afterward (see the Caching Rule above).

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
  with no request, some rendering *another* tenant's rows, so a thread-local
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
- **An incomplete config is *no* config.** All of enabled + account + key +
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
switch stays in whichever bucket it was written to. Only *future* uploads land in
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
`proxy-body-size: 0` and 600s read/send timeouts and gunicorn's `--timeout` is 600. Tests are in `core/tests.py` (`SiteBackupRoundTripTests`,
`SiteBackupApiTests`) — they inherit `IsolatedMediaTestCase`, which redirects
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
