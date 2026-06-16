# EdgeFolio API

Django REST Framework backend for **EdgeFolio** - a privacy-first career application
platform for software engineers. It owns the data model, authentication, all LLM
tailoring/scoring, company-intelligence pipelines, and the job-postings catalog.

The frontend (`apps/edge-folio`, Next.js PWA) never calls this API directly: every
request is proxied through Next.js Route Handlers that inject `Authorization: Bearer
<token>` from HTTP-only cookies. Read both READMEs for the full system - the frontend
one lives at [`apps/edge-folio/README.md`](../edge-folio/README.md).

---

## Summary

EdgeFolio's promise is **"the LLM ranks and rewrites, it never invents."** A user
curates a factual master record (the _Immutable Matrix_ + career profile); when applying
to a role, the backend scores and rewrites that content against the job description,
generates cover/TN letters, and produces ATS-ready output. A separate subsystem ingests
live job postings, and an async pipeline gathers company intelligence.

LLM calls go to **Groq** (structured output via `instructor`), automatically failing
over to **OpenRouter** on a 429 rate-limit. Long-running work (company pipelines, job
ingestion) runs on **Celery** with Redis.

---

## Architecture

### Django apps

| App            | Purpose                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`         | Abstract base models (`Common`: `enabled`/`created`/`modified`/`version`), `BasePicture`, `ResizedImageField`, shared serializers.                            |
| `users`        | Auth: signup, JWT login, email verification, password reset, **passkeys (WebAuthn)**, profile + picture, contact info, resume upload, job-search preferences. |
| `matrix`       | **Immutable Matrix**: `Skill` + `BulletPoint` (STAR, categorized, ordered, approvable), and the skeleton→bullets synthesis endpoint.                          |
| `career`       | `WorkExperience`, `Education`, `Language`, `Project`, and a shared `TechStack` catalog.                                                                       |
| `applications` | `JobApplication` + `Company`; the full tailoring/scoring pipeline and async company-intelligence Celery tasks.                                                |
| `jobs`         | Live job-postings catalog: `JobPosting`, BYOK `UserApiCredential` (encrypted), provider ingestion, per-user feeds.                                            |

### URL map (`edge_folio_api/urls.py`)

```
/admin/
/api/auth/          → users.urls
/api/matrix/        → matrix.urls
/api/applications/  → applications.urls
/api/career/        → career.urls
/api/jobs/          → jobs.urls
```

---

## Endpoints & Functions

### `users` - `/api/auth/`

| Endpoint                                                                                                                          | View                                                | Purpose                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| `signup/`                                                                                                                         | `SignUpView`                                        | Register (sends email verification)                   |
| `login/`                                                                                                                          | `LoginView`                                         | JWT obtain                                            |
| `token/refresh/`, `token/verify/`                                                                                                 | SimpleJWT                                           | Token lifecycle                                       |
| `profile/`, `profile/picture/`                                                                                                    | `ProfileView`, `ProfilePictureView`                 | Read/update profile + avatar                          |
| `onboarding/`                                                                                                                     | `OnboardingView`                                    | First-run setup                                       |
| `contact/`                                                                                                                        | `ContactInfoView`                                   | Contact details                                       |
| `job-search-prefs/`                                                                                                               | `JobSearchPrefsView`                                | Toggle which profile fields seed the job-search query |
| `resume/`                                                                                                                         | `ResumeUploadView`                                  | Resume upload (parsed via `pdfplumber`)               |
| `verify-email/<uuid>/`, `resend-verification/`                                                                                    | email verification                                  |
| `password-reset/`, `password-reset/confirm/`                                                                                      | password reset flow                                 |
| `passkey/register/options\|verify/`, `passkey/authenticate/options\|verify/`, `passkey/credentials/`, `passkey/credentials/<pk>/` | WebAuthn passkey registration, auth, and management |

### `matrix` - `/api/matrix/`

| Endpoint                    | View                                         | Purpose                                              |
| --------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `skills/`, `skills/<pk>/`   | `SkillListCreate`, `SkillDetail`             | Skill CRUD                                           |
| `bullets/`, `bullets/<pk>/` | `BulletPointListCreate`, `BulletPointDetail` | Bullet CRUD                                          |
| `bullets/reorder/`          | `BulletReorderView`                          | Bulk reorder                                         |
| `extract/`                  | `SkeletonSynthesisView`                      | Turn client Skeleton JSON into draft bullets via LLM |

### `career` - `/api/career/`

`work-experience/`, `education/`, `languages/`, `projects/` (each with `<pk>/` detail),
plus `tech-stack/` and `tech-stack/popular/`. Standard per-user CRUD.

### `applications` - `/api/applications/`

| Endpoint                | View                                               | Purpose                                                            |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| ``(list/create),`<pk>/` | `JobApplicationListCreate`, `JobApplicationDetail` | Application CRUD                                                   |
| `<pk>/tailor/`          | `TailorApplicationView`                            | Rank+rewrite bullets, skills, work, projects; compute match scores |
| `<pk>/cover-letter/`    | `CoverLetterView`                                  | Generate cover letter                                              |
| `<pk>/nafta-letter/`    | `NaftaLetterView`                                  | Generate NAFTA/USMCA TN letter                                     |
| `<pk>/metrics/`         | `RefreshMetricsView`                               | Recompute overall / technical / TN-likelihood scores               |
| `tn-suggest/`           | `TnSuggestView`                                    | Suggest NAFTA TN professional categories                           |

**Tailoring core** (`applications/tailoring.py`): `tailor_full_resume`,
`tailor_resume`, `tailor_skills`, `tailor_work_experiences`, `tailor_projects`,
`generate_professional_summary`, `generate_cover_letter`, `generate_nafta_letter`,
`suggest_tn_categories`, and scorers `calculate_overall_match` /
`calculate_technical_match` / `calculate_nafta_likelihood`. A keyword `_rank_bullets`
pre-filter narrows candidates before the LLM pass.

**Company intelligence** (`applications/tasks.py`, Celery): `run_company_pipeline`
scrapes & analyzes a company (about/analysis/intel score, logo download via
`_download_company_image`), with retry/backoff; `refresh_stale_companies` runs hourly.

### `jobs` - `/api/jobs/`

| Endpoint                            | View                 | Purpose                                         |
| ----------------------------------- | -------------------- | ----------------------------------------------- |
| `feed/`                             | `JobFeedView`        | Shared catalog + optional per-user private feed |
| `fetch/`                            | `FetchJobsView`      | On-demand BYOK fetch from providers             |
| `credentials/`, `credentials/<pk>/` | `UserApiCredential*` | Manage encrypted BYOK provider keys             |
| `<pk>/save/`                        | `SaveJobView`        | Save a posting into a `JobApplication`          |
| `<pk>/delete/`                      | `DeleteJobView`      | Remove a posting                                |

**Providers**: `jsearch` (primary), `adzuna` (fallback) - `PROVIDER_PRIORITY` tries
JSearch first because it returns the **full** job description, whereas Adzuna's API only
returns a truncated snippet. Both ingest paths fall back to Adzuna when JSearch returns
**zero results** for a query (not only when its quota is exhausted):
`ingest_shared_catalog` uses the platform provider credentials, and `ingest_user_feed` walks
the user's usable BYOK credentials, stopping at the first provider that returns a posting.
`DEFAULT_DAILY_LIMITS`: Adzuna 250/day, JSearch
200/day, counted locally (`call_limit`/`calls_used`/`usage_date`). Catalog targets the
**USMCA region** (`us`/`ca`/`mx`). BYOK keys are encrypted at rest with **Fernet**
(`jobs/crypto.py`, `JOBS_ENCRYPTION_KEY`, dev-derived from `SECRET_KEY`). Ingestion
(`jobs/ingest.py`, `jobs/tasks.py`): `ingest_shared_catalog` (daily), `ingest_user_feed`,
`prune_expired_postings` (daily). Postings dedup via a `dedup_hash` and expire via
`expires_at`.

---

## Technical Spec

### Stack

| Concern     | Technology                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Framework   | Django 5.2, Django REST Framework 3.16                                                                                    |
| Auth        | `djangorestframework-simplejwt` (access 60 min, refresh 7 days, rotation); `webauthn` for passkeys                        |
| LLM         | `groq` + `instructor` (structured output), OpenRouter fallback (via `openai` client) on 429 - see `edge_folio_api/llm.py` |
| Async       | `celery[redis]` + Celery Beat                                                                                             |
| Cache       | `django-redis` (Redis); in-memory fallback when `REDIS_URL` unset                                                         |
| DB          | PostgreSQL (`psycopg`) in prod; SQLite locally when `DB_HOST` empty                                                       |
| Storage     | Cloudflare R2 via `django-storages[s3]`; local filesystem fallback                                                        |
| Static      | `whitenoise`                                                                                                              |
| Serving     | `gunicorn`                                                                                                                |
| PDF parsing | `pdfplumber` (resume ingestion)                                                                                           |
| Crypto      | `cryptography` (Fernet) for BYOK keys                                                                                     |
| Images      | `Pillow` + `core.ResizedImageField` (Small 256 / Medium 512 / Regular 1200 / Large 3840)                                  |

### LLM helper (`edge_folio_api/llm.py`)

- `chat_structured(...)` - Groq via `instructor` with a Pydantic `response_model`;
  on a Groq `RateLimitError` (429) falls over to OpenRouter.
- `chat_text(...)` - plain completion with the same Groq→OpenRouter fallback.
- Models from settings: `GROQ_MODEL`, `OPENROUTER_MODEL` (default `openai/gpt-oss-120b`).

### Celery Beat schedule (`settings.py`)

| Task                                         | Cadence |
| -------------------------------------------- | ------- |
| `applications.tasks.refresh_stale_companies` | hourly  |
| `jobs.tasks.ingest_shared_catalog`           | daily   |
| `jobs.tasks.prune_expired_postings`          | daily   |

When no broker is configured, tasks run synchronously (dev convenience).

### Per-user caching

All data is per-user; cache keys are user-scoped:

```
{app}:{model_plural}:{user_id}          - list
{app}:{model_singular}:{user_id}:{pk}   - detail
```

Every write path (view `create`/`update`/`destroy` and admin `save_model`/`delete_model`)
invalidates the relevant keys. When a read serializer embeds another model, writes to the
embedded model also bust the parent's cache.

### Model conventions

Domain models inherit `core.models.Common` (`enabled`, `created`, `modified`, `version`
for optimistic locking). Adding a model/field is full-stack in one task: `admin.py`
(+ cache invalidation), serializer, view (list/retrieve cache + write invalidation), and
URL wiring.

---

## Running locally

```bash
cd apps/edge-folio-api
source venv/bin/activate
python manage.py migrate
python manage.py runserver 8000
```

After model changes:

```bash
python manage.py makemigrations && python manage.py migrate
```

Celery (only needed for async pipelines / scheduled ingestion):

```bash
celery -A edge_folio_api worker -l info
celery -A edge_folio_api beat   -l info
```

### Key environment variables

See `env.example`; `.env` is loaded locally.

| Variable                                                       | Purpose                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`                         | Django core                                                                           |
| `DB_HOST` (+ `DB_*`)                                           | Empty → SQLite; set → PostgreSQL                                                      |
| `REDIS_URL`                                                    | Cache + Celery broker; empty → in-memory cache                                        |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Email links + CORS/CSRF                                                               |
| `EMAIL_HOST*`                                                  | SMTP; empty → console backend                                                         |
| `GROQ_API_KEY`, `GROQ_MODEL`                                   | Primary LLM                                                                           |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`                       | LLM fallback on 429                                                                   |
| `SCRAPER_URL`, `SCRAPER_API_KEY`                               | Company / job-URL scraper service                                                     |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JSEARCH_API_KEY`           | Platform job-provider keys                                                            |
| `JOBS_ENCRYPTION_KEY`                                          | Fernet key for BYOK credentials (rotate independently; dev-derived from `SECRET_KEY`) |
| `WEBAUTHN_RP_ID\|NAME\|ORIGIN`                                 | Passkeys                                                                              |
| `R2_*`                                                         | Cloudflare R2 media storage (empty → local filesystem)                                |

---

## Deployment

Containerized (`Dockerfile`, `gunicorn.conf.py`, `entrypoint.sh`) and deployed to
MicroK8s via the Helm chart in `helm/`. See `apps/edge-folio-api/CLAUDE.md` for the
full backend conventions.
