import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-change-me-in-production')

DEBUG = os.environ.get('DEBUG', 'True') == 'True'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

# Trust the X-Forwarded-Proto header set by the reverse proxy (ingress/nginx)
# so Django knows requests are HTTPS even though it receives them over HTTP internally.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        'CSRF_TRUSTED_ORIGINS',
        'https://animals-api.iguzman.com.mx,https://animals.iguzman.com.mx',
    ).split(',')
    if origin.strip()
]

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        'CORS_ALLOWED_ORIGINS',
        'https://animals.iguzman.com.mx',
    ).split(',')
    if origin.strip()
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'colorfield',
    'core',
    'users',
    'catalog',
    'journal',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'animals_api.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'animals_api.wsgi.application'

# The cluster Postgres is used only when BOTH the host and a password are set:
# the .env ships the cluster hostname so it doubles as the deploy reference, and
# an empty DB_PASSWORD is what keeps development on the local SQLite file.
_DB_HOST = os.environ.get('DB_HOST', '')
_DB_PASSWORD = os.environ.get('DB_PASSWORD', '')

if _DB_HOST and _DB_PASSWORD:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'postgres'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': _DB_PASSWORD,
            'HOST': _DB_HOST,
            'PORT': os.environ.get('DB_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Caps a non-file request body - which is what a base64 image upload is. Every
# image in this project arrives that way, at most 3840 px, so 10 MB is generous.
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10 MB

# Video is the one upload that does NOT ride in a JSON body: it goes to
# `/api/journal/sightings/<pk>/media/video/` as multipart, which Django streams
# to a temp file instead of holding in memory, so the limit above does not apply
# to it. This is the ceiling that does - enforced in
# `journal.serializers.SightingVideoUploadSerializer`, not by Django.
#
# ⚠ nginx has its own limit in front of this one. The ingress must carry
# `nginx.ingress.kubernetes.io/proxy-body-size` at least this large, or a big
# upload is refused with a 413 that never reaches Django.
MAX_VIDEO_UPLOAD_MB = int(os.environ.get('MAX_VIDEO_UPLOAD_MB', '200'))

# ── Media files (uploaded by users) ──────────────────────────────────────────
# **Production stores media in Cloudflare R2, and only there.** There is no
# second backend and the chart gives the pod no storage of its own - no PVC, no
# hostPath volume, nothing to serve `/media/` from. The pod is stateless and the
# browser fetches every upload from Cloudflare's edge rather than from this
# process. Don't add a volume to get local media back; connect a bucket.
#
# `R2_ACCOUNT_ID` unset is a **development-only** mode: files land in `media/`
# on local disk, so `manage.py runserver` and the test suite need no Cloudflare
# account, no credentials and no network calls. It is NOT a production
# fallback - a pod's filesystem is ephemeral and is not backed up, so an unset
# `R2_ACCOUNT_ID` in the cluster silently throws every upload away on the next
# rollout.
#
# ⚠ Never put the R2_* variables in helm/values.yaml `env:`, not even as empty
# placeholders: `env` beats `envFrom`, so an empty value there shadows the
# Secret's real one and turns R2 off cluster-wide. They come from the Secret.
#
# Static files stay on whitenoise either way - they ship inside the image,
# already hashed and compressed at build time, so putting them behind a bucket
# would add a round-trip and a failure mode for no gain.
R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID', '')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID', '')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY', '')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', '')
# The Cloudflare custom hostname mapped to the bucket. With one, URLs are plain
# unsigned https://<domain>/<key> - cacheable, CDN-served, stable. Without one
# there is no public route to the object, so django-storages falls back to
# *presigned* S3-endpoint links: they work, but they expire, change on every
# render, and defeat both the CDN and the browser cache.
R2_PUBLIC_DOMAIN = os.environ.get('R2_PUBLIC_DOMAIN', 'r2.iguzman.com.mx').strip().strip('/')

if R2_ACCOUNT_ID:
    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.s3boto3.S3Boto3Storage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage',
        },
    }
    AWS_S3_ENDPOINT_URL = f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com'
    AWS_ACCESS_KEY_ID = R2_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY = R2_SECRET_ACCESS_KEY
    AWS_STORAGE_BUCKET_NAME = R2_BUCKET_NAME
    AWS_S3_CUSTOM_DOMAIN = R2_PUBLIC_DOMAIN or None
    # R2 has no regions; the SDK still requires the field in order to sign.
    AWS_S3_REGION_NAME = 'auto'
    AWS_QUERYSTRING_AUTH = not R2_PUBLIC_DOMAIN
    # R2 rejects ACL headers outright - it has no per-object ACLs.
    AWS_DEFAULT_ACL = None
    # Suffix rather than silently overwrite whatever already sits at that key.
    AWS_S3_FILE_OVERWRITE = False
    # `FileField.url` returns an absolute URL from here on, which is what lets
    # the frontend fetch straight from the edge.
    MEDIA_URL = f'https://{R2_PUBLIC_DOMAIN}/' if R2_PUBLIC_DOMAIN else '/media/'
    # Nothing reads or writes here with R2 on; kept defined only because Django
    # and third-party code (ImageField validation, test helpers) expect the
    # setting to exist.
    MEDIA_ROOT = Path(os.environ.get('MEDIA_ROOT', str(BASE_DIR / 'media')))
else:
    # Development only - see the note above.
    STORAGES = {
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage',
        },
    }
    MEDIA_URL = '/media/'
    MEDIA_ROOT = Path(os.environ.get('MEDIA_ROOT', str(BASE_DIR / 'media')))

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Same rule as the database: the cluster Redis is used only when BOTH the URL
# and a password are set, so an empty REDIS_PASSWORD keeps development on the
# local-memory cache without having to blank the URL.
_REDIS_URL = os.environ.get('REDIS_URL', '')
_REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD', '')

if _REDIS_URL and _REDIS_PASSWORD:
    _redis_options: dict = {
        'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        'PASSWORD': _REDIS_PASSWORD,
    }

    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': _REDIS_URL,
            'OPTIONS': _redis_options,
        }
    }
    SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
    SESSION_CACHE_ALIAS = 'default'
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }

# Whether API responses are cached at all. **Off in development**: the Django
# admin is this project's CMS, and a five-minute stale list after uploading an
# image reads exactly like a lost write. On everywhere else - production serves a
# public journal from Redis, where the cache is the point.
#
# This is a switch on the *response* layer (see core/cache.py), not on CACHES
# itself, deliberately: the cache also holds WebAuthn challenges mid-ceremony and
# (on Redis) sessions, so a DummyCache backend would break passkeys on a laptop.
#
# Set API_CACHE_ENABLED=True locally to exercise the production path.
API_CACHE_ENABLED = os.environ.get(
    'API_CACHE_ENABLED', 'False' if DEBUG else 'True'
) == 'True'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': os.environ.get('DJANGO_LOG_LEVEL', 'WARNING'),
            'propagate': False,
        },
    },
}

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

_EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')

if _EMAIL_HOST_USER:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.ionos.com')
    EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
    EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
    EMAIL_HOST_USER = _EMAIL_HOST_USER
    EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
    DEFAULT_FROM_EMAIL = EMAIL_HOST_USER
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
    DEFAULT_FROM_EMAIL = 'noreply@localhost'

EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS = int(
    os.environ.get('EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS', 24)
)
PASSWORD_RESET_TOKEN_EXPIRY_HOURS = int(
    os.environ.get('PASSWORD_RESET_TOKEN_EXPIRY_HOURS', 1)
)

WEBAUTHN_RP_ID = os.environ.get('WEBAUTHN_RP_ID', 'localhost')
WEBAUTHN_RP_NAME = os.environ.get('WEBAUTHN_RP_NAME', 'Animals_api')
WEBAUTHN_RP_ORIGIN = os.environ.get('WEBAUTHN_RP_ORIGIN', 'http://localhost:3000')

# ── AI providers ─────────────────────────────────────────────────────────────
# Every LLM call goes through `core/services/llm.py`: Groq first, OpenRouter as
# the fallback. The frontend is a public journal that holds no keys, so these
# live here and nowhere else. With neither key set the `/api/ai/*` endpoints
# return 503 rather than failing halfway - so a 503 from one of them means the
# key never reached the process, not that a provider is down.
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL = os.environ.get('GROQ_MODEL', 'openai/gpt-oss-120b')

OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')
OPENROUTER_MODEL = os.environ.get(
    'OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct'
)

LLM_REQUEST_TIMEOUT = float(os.environ.get('LLM_REQUEST_TIMEOUT', '20'))

# ── Web research (the `scraper` microservice) ────────────────────────────────
# Backs `POST /api/ai/research/`, which reads live pages about a species before
# the LLM maps what it found onto model fields. Optional: with SCRAPER_API_KEY
# unset the endpoint still answers, from the model's own knowledge and with no
# sources - see core/services/scraper.py.
SCRAPER_BASE_URL = os.environ.get('SCRAPER_BASE_URL', 'https://scraper.iguzman.com.mx')
SCRAPER_API_KEY = os.environ.get('SCRAPER_API_KEY', '')
