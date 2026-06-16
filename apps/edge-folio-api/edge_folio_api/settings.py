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
        'https://api-edge-folio.iguzman.com.mx,https://edge-folio.iguzman.com.mx',
    ).split(',')
    if origin.strip()
]

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        'CORS_ALLOWED_ORIGINS',
        'https://edge-folio.iguzman.com.mx',
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
    'matrix',
    'applications',
    'career',
    'jobs',
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

ROOT_URLCONF = 'edge_folio_api.urls'

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

WSGI_APPLICATION = 'edge_folio_api.wsgi.application'

_DB_HOST = os.environ.get('DB_HOST', '')

if _DB_HOST:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'postgres'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
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

# File upload cap - large enough for PDF resumes processed in memory, never stored.
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10 MB

_R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID', '')

if _R2_ACCOUNT_ID:
    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.s3boto3.S3Boto3Storage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage',
        },
    }
    AWS_S3_ENDPOINT_URL = f'https://{_R2_ACCOUNT_ID}.r2.cloudflarestorage.com'
    AWS_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID', '')
    AWS_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY', '')
    AWS_STORAGE_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', '')
    AWS_S3_CUSTOM_DOMAIN = os.environ.get('R2_PUBLIC_DOMAIN', '')
    AWS_S3_REGION_NAME = 'auto'
    AWS_QUERYSTRING_AUTH = False
    AWS_DEFAULT_ACL = None
    MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/'
else:
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

_REDIS_URL = os.environ.get('REDIS_URL', '')

if _REDIS_URL:
    _redis_options: dict = {
        'CLIENT_CLASS': 'django_redis.client.DefaultClient',
    }
    _redis_password = os.environ.get('REDIS_PASSWORD', '')
    if _redis_password:
        _redis_options['PASSWORD'] = _redis_password

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
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
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

WEBAUTHN_RP_ID = os.environ.get('WEBAUTHN_RP_ID', 'localhost')
WEBAUTHN_RP_NAME = os.environ.get('WEBAUTHN_RP_NAME', 'Edge Folio')
WEBAUTHN_RP_ORIGIN = os.environ.get('WEBAUTHN_RP_ORIGIN', 'http://localhost:3000')

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

GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL = os.environ.get('GROQ_MODEL', 'openai/gpt-oss-120b')

OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')
OPENROUTER_MODEL = os.environ.get('OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct')

SCRAPER_URL = os.environ.get('SCRAPER_URL', 'http://localhost:4000')
SCRAPER_API_KEY = os.environ.get('SCRAPER_API_KEY', '')

# ── Jobs catalog ────────────────────────────────────────────────────────────────
ADZUNA_APP_ID = os.environ.get('ADZUNA_APP_ID', '')
ADZUNA_APP_KEY = os.environ.get('ADZUNA_APP_KEY', '')
JSEARCH_API_KEY = os.environ.get('JSEARCH_API_KEY', '')
# Fernet key for encrypting BYOK provider credentials. Falls back to a key derived
# from SECRET_KEY for local dev so the feature works without extra configuration.
JOBS_ENCRYPTION_KEY = os.environ.get('JOBS_ENCRYPTION_KEY', '')
# Per-run ceiling on platform catalog queries (each query spends one provider call,
# starting with JSearch). Default fits the tighter free tier at one run per day; raise
# via env var when on a paid plan. Back-compat: falls back to the legacy
# JOBS_ADZUNA_DAILY_BUDGET env var if the new one is unset.
JOBS_DAILY_QUERY_BUDGET = int(
    os.environ.get('JOBS_DAILY_QUERY_BUDGET')
    or os.environ.get('JOBS_ADZUNA_DAILY_BUDGET', '8')
)

# ── Celery ────────────────────────────────────────────────────────────────────
# Run tasks synchronously in dev when no broker is configured.
CELERY_TASK_ALWAYS_EAGER = not bool(_REDIS_URL)
CELERY_TASK_EAGER_PROPAGATES = True

_CELERY_BROKER = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
_CELERY_REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD', '')
if _CELERY_REDIS_PASSWORD:
    from urllib.parse import urlparse, urlunparse
    _parsed = urlparse(_CELERY_BROKER)
    _CELERY_BROKER = urlunparse(
        _parsed._replace(netloc=f':{_CELERY_REDIS_PASSWORD}@{_parsed.hostname}:{_parsed.port}')
    )
CELERY_BROKER_URL = _CELERY_BROKER
CELERY_RESULT_BACKEND = _CELERY_BROKER
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_BEAT_SCHEDULE = {
    'refresh-stale-companies': {
        'task': 'applications.tasks.refresh_stale_companies',
        'schedule': 3600.0,
    },
    'ingest-shared-catalog': {
        'task': 'jobs.tasks.ingest_shared_catalog',
        'schedule': 24 * 3600.0,  # daily - keeps usage within the 250 calls/month free tier
    },
    'prune-expired-postings': {
        'task': 'jobs.tasks.prune_expired_postings',
        'schedule': 24 * 3600.0,  # daily
    },
}
