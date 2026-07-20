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
