# Edge Folio API

Django REST Framework backend for EdgeFolio — a privacy-first career application platform for software engineers. Features: Immutable Matrix (master bullet point database), job application tailoring, ATS resume/cover letter export, and NDA-compliant codebase extraction.

## Running Locally

```bash
cd apps/edge-folio-api
source venv/bin/activate
python manage.py runserver 8000
```

Migrations after model changes:
```bash
python manage.py makemigrations
python manage.py migrate
```

The frontend proxies all API calls through its own Route Handlers, so the Django dev server must be on port 8000.

## Architecture

### Django Apps

| App | Purpose |
|---|---|
| `core` | Abstract base models (`Common`, `BasePicture`, `picture_mixin`), `ResizedImageField`. |
| `users` | Full auth: signup, login (JWT), email verification, password reset, passkeys (WebAuthn), profile + picture upload, contact info, resume upload, job-search prefs. |
| `matrix` | The Immutable Matrix: `Skill` + `BulletPoint` (STAR, categorized, ordered, approvable) and the skeleton→bullets synthesis endpoint. |
| `career` | `WorkExperience`, `Education`, `Language`, `Project`, shared `TechStack` catalog. |
| `applications` | `JobApplication` + `Company`; LLM tailoring/scoring pipeline (`tailoring.py`) and async company-intelligence Celery tasks (`tasks.py`). |
| `jobs` | Live job-postings catalog: `JobPosting`, BYOK `UserApiCredential` (Fernet-encrypted), provider ingestion (Adzuna/JSearch), per-user feeds, Celery ingestion tasks. |

New feature domains each get their own app. ATS resume/cover-letter export is rendered
**client-side** in the frontend (`@react-pdf/renderer`), not a Django app.

> **Status:** all six apps above are implemented and wired. See
> `apps/edge-folio-api/README.md` for the full endpoint and function inventory.

### LLM & async infrastructure

- **`edge_folio_api/llm.py`** — `chat_structured` (Groq + `instructor` structured output)
  and `chat_text`, both failing over to **OpenRouter** on a Groq 429. Models from
  `GROQ_MODEL` / `OPENROUTER_MODEL`.
- **Celery** (`celery[redis]`) runs company pipelines and job ingestion. Beat schedule
  (`settings.CELERY_BEAT_SCHEDULE`): `refresh_stale_companies` hourly,
  `ingest_shared_catalog` + `prune_expired_postings` daily. Tasks run synchronously when
  no broker is configured (dev).

### Creating a New App

```bash
python manage.py startapp <name>
```

Then:
1. Add to `INSTALLED_APPS` in `edge_folio_api/settings.py`
2. Add URL include in `edge_folio_api/urls.py`: `path('api/<name>/', include('<name>.urls'))`
3. Register models in `<name>/admin.py`

### URL Namespacing

```
/api/auth/          → users.urls
/api/matrix/        → matrix.urls
/api/career/        → career.urls
/api/applications/  → applications.urls
/api/jobs/          → jobs.urls
```

### Authentication

JWT via `rest_framework_simplejwt`. Access token: 60 min, Refresh: 7 days, rotation enabled.

- **Protected views** use `permission_classes = [IsAuthenticated]` (the DRF default in settings).
- **Public views** must explicitly set `permission_classes = [AllowAny]`.
- The frontend never calls Django directly — all requests are proxied through Next.js Route Handlers that inject `Authorization: Bearer <token>` from HTTP-only cookies. Never disable CORS to "fix" a frontend issue.

### Model Conventions

All domain models inherit from `core.models.Common`, which provides:
- `enabled` (BooleanField)
- `created` / `modified` (auto DateTimeField)
- `version` (PositiveIntegerField, for optimistic locking)

For models with images, use the standard size tiers from `core.models`:
- `SmallPicture` (256px) — avatars, thumbnails
- `MediumPicture` (512px) — card previews
- `RegularPicture` (1200px) — content images
- `LargePicture` (3840px) — hero / full-bleed images

### Serializers & Views

Follow the existing patterns in `users/`:
- Use `generics.*` (CreateAPIView, RetrieveUpdateAPIView, etc.) for standard CRUD.
- Use `APIView` for custom multi-method endpoints.
- Separate read serializers (for output) from write serializers (for input) when they differ — see `UserProfileSerializer` vs `UserProfileUpdateSerializer`.

## Caching Rule

All data in this API is **per-user**. Cache keys must always be user-scoped.

### Cache key naming

```
{app}:{model_plural}:{user_id}          — list
{app}:{model_singular}:{user_id}:{pk}   — detail
```

Examples: `matrix:skills:42`, `matrix:bullet:42:7`

### Caching GET responses

```python
from django.core.cache import cache

CACHE_TTL = 300  # 5 minutes

# In a generics view, override list() / retrieve():
def list(self, request, *args, **kwargs):
    cache_key = f'myapp:mymodels:{request.user.id}'
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
    response = super().list(request, *args, **kwargs)
    cache.set(cache_key, response.data, CACHE_TTL)
    return response
```

### Cache invalidation on writes

Invalidate in every write path (create, update, destroy). Define helpers at the top of `views.py` and `admin.py`:

```python
def _invalidate_mymodel(user_id, pk=None):
    cache.delete(f'myapp:mymodels:{user_id}')
    if pk is not None:
        cache.delete(f'myapp:mymodel:{user_id}:{pk}')
```

Call in write methods:
```python
def create(self, request, *args, **kwargs):
    response = super().create(request, *args, **kwargs)
    _invalidate_mymodel(request.user.id)
    return response

def update(self, request, *args, **kwargs):
    response = super().update(request, *args, **kwargs)
    _invalidate_mymodel(request.user.id, kwargs.get('pk'))
    return response

def destroy(self, request, *args, **kwargs):
    pk = kwargs.get('pk')
    response = super().destroy(request, *args, **kwargs)
    _invalidate_mymodel(request.user.id, pk)
    return response
```

### Admin cache invalidation

Override `save_model` and `delete_model` in every `ModelAdmin`:

```python
def save_model(self, request, obj, form, change):
    super().save_model(request, obj, form, change)
    _invalidate_mymodel(obj.user_id, obj.pk)

def delete_model(self, request, obj):
    _invalidate_mymodel(obj.user_id, obj.pk)
    super().delete_model(request, obj)
```

**Note:** Call `super().save_model(...)` *before* invalidating; call `super().delete_model(...)` *after* invalidating.

### Cross-model invalidation

When model A embeds model B in its read serializer, writes to B must also bust A's cache. Example: `BulletPointReadSerializer` embeds skills, so any skill write also calls `cache.delete(f'matrix:bullets:{user_id}')`.

## Models — Full-Stack Coverage Rule

When adding a **new model** or a **new field to an existing model**, automatically do all of this in the same task:

1. **`admin.py`** — register the model (or add the field to `list_display` / `fields` / `readonly_fields`). Add `save_model`/`delete_model` cache invalidation.
2. **Serializer** — create or update a DRF serializer for the model/field.
3. **View** — create or update the corresponding API view with `list`/`retrieve` caching and write invalidation.
4. **URL / endpoint** — wire the view into the router or `urlpatterns`.

## Key Environment Variables

See `env.example`. Locally, `.env` is loaded.

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Django secret key |
| `DEBUG` | `True` locally, `False` in production |
| `DB_HOST` | Omit to use SQLite; set for PostgreSQL |
| `REDIS_URL` | Omit to use in-memory cache |
| `FRONTEND_URL` | Used in email links (default: `http://localhost:3000`) |
| `EMAIL_HOST_USER` | Omit to use console email backend |
