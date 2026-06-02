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
| `users` | Full auth: signup, login (JWT), email verification, password reset, profile + picture upload. |

New feature domains each get their own app. Planned apps:
- **`matrix`** — The Immutable Matrix: user-approved bullet points (STAR format), skills, projects
- **`applications`** — Job applications, tailoring sessions, cover letters
- **`resumes`** — Resume templates, ATS PDF export jobs

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
/api/matrix/        → matrix.urls  (planned)
/api/applications/  → applications.urls  (planned)
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
