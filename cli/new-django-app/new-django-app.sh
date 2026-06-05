#!/usr/bin/env bash
# new-django-app.sh — interactive Django REST API scaffold
# Same UI/UX as cli/deploy-app/deploy-app.sh (colors, prompts, section headers)
#
# Run: bash cli/new-django-app/new-django-app.sh

set -euo pipefail

# ── ANSI Colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
CYAN='\033[36m'
YELLOW='\033[33m'

clr_red()         { printf "${RED}%s${RESET}" "$*"; }
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow() { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Nuevo App Django"
    SUBTITLE="Genera el scaffold para una nueva API Django REST."
    APP_NAME_PROMPT="Nombre del app (ej. my-api)"
    APP_NAME_REQUIRED="El nombre es requerido."
    APP_NAME_INVALID="El nombre debe empezar con letra y contener solo minúsculas, números y guiones."
    MODULE_PROMPT="Nombre del módulo Django (paquete Python)"
    HOST_PROMPT="Host"
    FRONTEND_PROMPT="URL del frontend"
    REDIS_PROMPT="¿Incluir caché Redis?"
    EMAIL_PROMPT="¿Incluir email (verificación + reset de contraseña)?"
    PASSKEY_PROMPT="¿Incluir passkeys (WebAuthn)?"
    R2_PROMPT="¿Incluir almacenamiento Cloudflare R2?"
    REGISTRY_PROMPT="Usuario del registro Docker"
    STEP_CONFIG="[1/3] Configuración"
    STEP_FILES="[2/3] Generando archivos"
    STEP_SETUP="[3/3] Configurando entorno"
    DONE_MSG="¡Listo!"
    NEXT_STEPS="Próximos pasos"
    LBL_MODULE="Módulo"
    LBL_HOST="Host"
    LBL_FRONTEND="Frontend"
    LBL_REDIS="Redis"
    LBL_EMAIL="Email"
    LBL_PASSKEYS="Passkeys"
    LBL_R2="R2"
    LBL_REGISTRY="Registro"
    CREATING="Creando"
    YES_STR="sí"
    NO_STR="no"
    CONFIRM_YES_CHARS="sy"
    PREREQ_CHECKING="Verificando requisitos previos..."
    PREREQ_MISSING_PYTHON="python3 no está instalado."
    PREREQ_MISSING_PIP="pip no está instalado."
    PREREQ_MISSING_DJANGO="Django no está instalado globalmente."
    PREREQ_FIX="Instala las herramientas faltantes ejecutando:"
    PREREQ_CMD="bash cli/setup-dev-env/setup-dev-env.sh"
    SETUP_VENV="Creando entorno virtual..."
    SETUP_VENV_DONE="Entorno virtual creado."
    SETUP_DEPS="Instalando dependencias de Python..."
    SETUP_DEPS_DONE="Dependencias instaladas."
    SETUP_MIGRATE="Aplicando migraciones de base de datos..."
    SETUP_MIGRATE_DONE="Migraciones aplicadas."
    SETUP_SUPERUSER="Creando superusuario — sigue las instrucciones:"
    SETUP_DONE="Superusuario creado."
  else
    WELCOME="New Django App"
    SUBTITLE="Scaffold a new Django REST API application."
    APP_NAME_PROMPT="App name (e.g., my-api)"
    APP_NAME_REQUIRED="App name is required."
    APP_NAME_INVALID="Name must start with a letter and contain only lowercase letters, numbers, and hyphens."
    MODULE_PROMPT="Django module name (Python package)"
    HOST_PROMPT="Host"
    FRONTEND_PROMPT="Frontend URL"
    REDIS_PROMPT="Include Redis cache?"
    EMAIL_PROMPT="Include email (signup verification + password reset)?"
    PASSKEY_PROMPT="Include passkeys (WebAuthn)?"
    R2_PROMPT="Include Cloudflare R2 object storage?"
    REGISTRY_PROMPT="Docker registry user"
    STEP_CONFIG="[1/3] Configuration"
    STEP_FILES="[2/3] Generating files"
    STEP_SETUP="[3/3] Setting up environment"
    DONE_MSG="Done!"
    NEXT_STEPS="Next steps"
    LBL_MODULE="Module"
    LBL_HOST="Host"
    LBL_FRONTEND="Frontend"
    LBL_REDIS="Redis"
    LBL_EMAIL="Email"
    LBL_PASSKEYS="Passkeys"
    LBL_R2="R2"
    LBL_REGISTRY="Registry"
    CREATING="Creating"
    YES_STR="yes"
    NO_STR="no"
    CONFIRM_YES_CHARS="y"
    PREREQ_CHECKING="Checking prerequisites..."
    PREREQ_MISSING_PYTHON="python3 is not installed."
    PREREQ_MISSING_PIP="pip is not installed."
    PREREQ_MISSING_DJANGO="Django is not installed globally."
    PREREQ_FIX="Install missing tools first by running:"
    PREREQ_CMD="bash cli/setup-dev-env/setup-dev-env.sh"
    SETUP_VENV="Creating virtual environment..."
    SETUP_VENV_DONE="Virtual environment created."
    SETUP_DEPS="Installing Python dependencies..."
    SETUP_DEPS_DONE="Dependencies installed."
    SETUP_MIGRATE="Applying database migrations..."
    SETUP_MIGRATE_DONE="Migrations applied."
    SETUP_SUPERUSER="Creating superuser — follow the prompts:"
    SETUP_DONE="Superuser created."
  fi
}

# ── UI ────────────────────────────────────────────────────────────────────────

print_header() {
  local line
  line="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

prompt_visible() {
  local label="$1" default="${2:-}"
  if [[ -n "${default}" ]]; then
    printf "  %s (%s): " "$(clr_bold "${label}")" "$(clr_dim "${default}")" >/dev/tty
  else
    printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  fi
  local val
  IFS= read -r val </dev/tty || true
  if [[ -z "${val}" && -n "${default}" ]]; then val="${default}"; fi
  printf '%s' "${val}"
}

# confirm_yn LABEL DEFAULT — returns 0 (yes) or 1 (no)
confirm_yn() {
  local label="$1" default="${2:-y}"
  local suffix default_upper="${default^^}"
  suffix="[Y/N] (${default_upper})"
  printf "  %s %s: " "$(clr_bold "${label}")" "$(clr_dim "${suffix}")" >/dev/tty
  local val
  IFS= read -r val </dev/tty || true
  val="${val:-${default}}"
  local char="${val:0:1}"
  char="${char,,}"
  [[ "${char}" == "y" || "${char}" == "s" ]]
}

# ── Helpers ───────────────────────────────────────────────────────────────────

to_module_name() { echo "${1//-/_}"; }

to_title_case() {
  local str="$1" result="" word
  IFS='-' read -ra words <<< "${str}"
  for word in "${words[@]}"; do
    [[ -n "${word}" ]] && result+="${word^} "
  done
  echo "${result% }"
}

validate_app_name() {
  local n="$1"
  [[ -z "${n}" ]]                      && echo "${APP_NAME_REQUIRED}" && return
  [[ ! "${n}" =~ ^[a-z][a-z0-9-]*$ ]] && echo "${APP_NAME_INVALID}"  && return
  [[ -d "${repo_root}/apps/${n}" ]]    && echo "Directory apps/${n} already exists." && return
  echo ""
}

check_prerequisites() {
  printf "  %s\n" "$(clr_dim "${PREREQ_CHECKING}")"

  local ok=1

  if ! command -v python3 &>/dev/null; then
    printf "  %s  %s\n" "$(clr_bold_red '✗')" "${PREREQ_MISSING_PYTHON}"
    ok=0
  else
    if ! (command -v pip3 &>/dev/null || python3 -m pip --version &>/dev/null 2>&1); then
      printf "  %s  %s\n" "$(clr_bold_red '✗')" "${PREREQ_MISSING_PIP}"
      ok=0
    fi
    if ! python3 -m django --version &>/dev/null 2>&1; then
      printf "  %s  %s\n" "$(clr_bold_red '✗')" "${PREREQ_MISSING_DJANGO}"
      ok=0
    fi
  fi

  if [[ "${ok}" -eq 0 ]]; then
    echo ""
    printf "  %s\n" "${PREREQ_FIX}"
    printf "  %s\n\n" "$(clr_bold_cyan "${PREREQ_CMD}")"
    exit 1
  fi

  echo ""
}

# ── File Generators ───────────────────────────────────────────────────────────
# All generators use globals: name, module_name, host, frontend_url,
# include_redis, include_email, include_passkey, include_r2, registry_user

gen_package_json() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
{
  "name": "${name}",
  "version": "0.1.0",
  "scripts": {
    "venv": "source venv/bin/activate",
    "requirements": "pip install -r requirements.txt",
    "static": "python3 manage.py collectstatic --noinput",
    "migrate": "python3 manage.py migrate",
    "migrations": "python3 manage.py makemigrations",
    "superuser": "python3 manage.py createsuperuser",
    "dev": "python3 manage.py runserver"
  }
}
EOF
}

gen_requirements_txt() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
Django==5.2.11
djangorestframework==3.16.1
djangorestframework_simplejwt==5.5.1
Pillow==11.1.0
whitenoise==6.9.0
gunicorn==23.0.0
psycopg[binary]==3.2.4
django-colorfield==0.11.0
django-cors-headers==4.9.0
PYEOF
  echo "python-dotenv==1.1.1" >> "$out"
  [[ "${include_redis}"   == "y" ]] && echo "django-redis==5.4.0"         >> "$out" || true
  [[ "${include_passkey}" == "y" ]] && echo "webauthn==2.7.1"             >> "$out" || true
  [[ "${include_r2}"      == "y" ]] && echo "django-storages[s3]==1.14.4" >> "$out" || true
}

gen_manage_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', '${module_name}.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
EOF
}

gen_entrypoint_sh() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'SHEOF'
#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec "$@"
SHEOF
  chmod +x "$out"
}

gen_gunicorn_conf_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
import multiprocessing

bind = '0.0.0.0:8000'
workers = int(__import__('os').environ.get('GUNICORN_WORKERS', multiprocessing.cpu_count() * 2 + 1))
timeout = int(__import__('os').environ.get('GUNICORN_TIMEOUT', 120))
loglevel = __import__('os').environ.get('GUNICORN_LOG_LEVEL', 'warning')
accesslog = '-'
errorlog = '-'
PYEOF
}

gen_dockerfile() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
# syntax=docker.io/docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 – Install Python dependencies.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS deps

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --upgrade pip \\
    && pip install --prefix=/install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2 – Build static files.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /app
COPY --from=deps /install /usr/local
COPY . .

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN DJANGO_SETTINGS_MODULE=${module_name}.settings \\
    SECRET_KEY=build-time-secret-key \\
    python manage.py collectstatic --noinput

# ---------------------------------------------------------------------------
# Stage 3 – Minimal production image.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev && rm -rf /var/lib/apt/lists/*

COPY --from=deps /install /usr/local
COPY --from=builder /app /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=${module_name}.settings

RUN addgroup --system --gid 1001 django && \\
    adduser --system --uid 1001 --ingroup django django && \\
    mkdir -p /app/media && chown -R django:django /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER django

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "--config", "gunicorn.conf.py", "${module_name}.wsgi:application"]
EOF
}

gen_settings_py() {
  local out="$1"
  local rp_name
  rp_name="$(to_title_case "${module_name}")"
  mkdir -p "$(dirname "$out")"

  cat > "$out" << EOF
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
        'https://${host},${frontend_url}',
    ).split(',')
    if origin.strip()
]

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        'CORS_ALLOWED_ORIGINS',
        '${frontend_url}',
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

ROOT_URLCONF = '${module_name}.urls'

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

WSGI_APPLICATION = '${module_name}.wsgi.application'

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

DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10 MB

EOF

  if [[ "${include_r2}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'
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
PYEOF
  else
    cat >> "$out" << 'PYEOF'
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
PYEOF
  fi

  cat >> "$out" << 'PYEOF'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
PYEOF

  if [[ "${include_redis}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'

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
PYEOF
  else
    cat >> "$out" << 'PYEOF'

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}
PYEOF
  fi

  cat >> "$out" << 'PYEOF'

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
PYEOF

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'

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
PYEOF
  fi

  if [[ "${include_passkey}" == "y" ]]; then
    cat >> "$out" << EOF

WEBAUTHN_RP_ID = os.environ.get('WEBAUTHN_RP_ID', 'localhost')
WEBAUTHN_RP_NAME = os.environ.get('WEBAUTHN_RP_NAME', '${rp_name}')
WEBAUTHN_RP_ORIGIN = os.environ.get('WEBAUTHN_RP_ORIGIN', 'http://localhost:3000')
EOF
  fi
}

gen_urls_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api-auth/', include('rest_framework.urls')),
    path('api/auth/', include('users.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
PYEOF
}

gen_wsgi_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', '${module_name}.settings')
application = get_wsgi_application()
EOF
}

gen_asgi_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', '${module_name}.settings')
application = get_asgi_application()
EOF
}

gen_init_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  > "$out"
}

gen_core_apps_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
PYEOF
}

gen_core_fields_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
import io

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db import models
from PIL import Image


class ResizedImageField(models.ImageField):
    """
    ImageField that automatically resizes images on upload using Pillow.

    Args:
        max_size: [max_width, max_height] — use None for unconstrained axis.
                  e.g. [512, None] constrains width to 512 px, height scales
                  proportionally; [None, 300] constrains only height.
        quality:  JPEG/WebP compression quality (1–95). Default 85.
    """

    def __init__(self, *args, max_size=None, quality=85, **kwargs):
        self.max_size = max_size
        self.quality = quality
        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        if self.max_size is not None:
            kwargs["max_size"] = self.max_size
        if self.quality != 85:
            kwargs["quality"] = self.quality
        return name, path, args, kwargs

    def pre_save(self, model_instance, add):
        file = getattr(model_instance, self.attname)
        if file and hasattr(file, "file") and not file._committed:
            resized = self._resize(file)
            if resized is not None:
                setattr(model_instance, self.attname, resized)
        return super().pre_save(model_instance, add)

    def _resize(self, file):
        if not self.max_size:
            return None

        max_w, max_h = self.max_size

        try:
            img = Image.open(file)
        except Exception:
            return None

        img_format = (img.format or "JPEG").upper()
        w, h = img.size

        # Compute target dimensions maintaining aspect ratio.
        new_w, new_h = w, h
        if max_w is not None and new_w > max_w:
            ratio = max_w / new_w
            new_w, new_h = max_w, int(new_h * ratio)
        if max_h is not None and new_h > max_h:
            ratio = max_h / new_h
            new_w, new_h = int(new_w * ratio), max_h

        if (new_w, new_h) == (w, h):
            return None  # Image already fits within bounds.

        img = img.resize((new_w, new_h), Image.LANCZOS)

        # JPEG does not support transparency channels.
        if img_format == "JPEG" and img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")

        output = io.BytesIO()
        save_kwargs: dict = {"format": img_format, "optimize": True}
        if img_format in ("JPEG", "WEBP"):
            save_kwargs["quality"] = self.quality
        img.save(output, **save_kwargs)
        output.seek(0)

        mime = f"image/{img_format.lower()}"
        return InMemoryUploadedFile(
            file=output,
            field_name=self.name,
            name=file.name,
            content_type=mime,
            size=output.getbuffer().nbytes,
            charset=None,
        )
PYEOF
}

gen_core_models_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  # Single-quoted heredoc: prevents bash from interpreting ``backticks`` in docstrings
  cat > "$out" << 'PYEOF'
import os
import uuid

from colorfield.fields import ColorField
from django.db import models

from core.fields import ResizedImageField


class Common(models.Model):
    enabled = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=0)

    class Meta:
        abstract = True


def picture(instance, filename):
    ext = os.path.splitext(filename)[1].lstrip(".") or "jpg"
    return f"pictures/{instance.__class__.__name__.lower()}/{uuid.uuid4().hex}.{ext}"


FIT_CHOICES = [
    ("cover", "Cover"),
    ("contain", "Contain"),
    ("fill", "Fill"),
    ("scale-down", "Scale Down"),
    ("none", "None"),
]


class BasePicture(Common):
    """
    Abstract base for all picture models.

    Provides display metadata (name, description, href) and CSS-layout hints
    (fit, background_color). Concrete size variants are produced by
    ``picture_mixin()``.
    """

    name = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    href = models.URLField(max_length=255, null=True, blank=True)
    fit = models.CharField(
        max_length=16,
        choices=FIT_CHOICES,
        default="cover",
        null=True,
        blank=True,
    )
    background_color = ColorField(null=True, blank=True, default="#fff")

    class Meta:
        abstract = True


def picture_mixin(max_width: int, quality: int = 85):
    """
    Factory that returns an abstract Picture mixin for the given size tier.

    Args:
        max_width: Maximum image width in pixels. Height scales proportionally.
        quality:   JPEG/WebP compression quality (1–95).

    Usage::

        class ProductThumbnail(picture_mixin(256)):
            product = models.ForeignKey("Product", on_delete=models.CASCADE)

        class BlogPost(picture_mixin(1200)):
            title = models.CharField(max_length=255)
    """

    class _PictureMixin(BasePicture):
        image = ResizedImageField(
            null=True,
            blank=True,
            max_size=[max_width, None],
            quality=quality,
            upload_to=picture,
        )

        class Meta:
            abstract = True

    _PictureMixin.__name__ = f"Picture{max_width}"
    _PictureMixin.__qualname__ = f"Picture{max_width}"
    return _PictureMixin


# Standard size tiers — use these directly or call picture_mixin() for custom sizes.
SmallPicture   = picture_mixin(256)          # thumbnails, avatars
MediumPicture  = picture_mixin(512)          # cards, previews
RegularPicture = picture_mixin(1200)         # content images, banners
LargePicture   = picture_mixin(3840, quality=90)  # hero images, full-bleed
PYEOF
}

gen_core_serializers_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
import base64
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image
from rest_framework import serializers


class ImageProcessingSerializer(serializers.Serializer):
    """
    Accepts a base64-encoded image and processes it to JPEG.

    Parameters (set as class attributes or pass via __init__):
      max_size (int, int) — thumbnail bounding box, default (512, 512)
      quality  int        — JPEG quality 1–95, default 90
    """

    max_size = (512, 512)
    quality = 90

    base64_image = serializers.CharField(write_only=True)

    def __init__(self, *args, max_size=None, quality=None, **kwargs):
        super().__init__(*args, **kwargs)
        if max_size is not None:
            self.max_size = max_size
        if quality is not None:
            self.quality = quality

    def validate_base64_image(self, value):
        if ',' in value:
            value = value.split(',', 1)[1]
        try:
            image_bytes = base64.b64decode(value)
        except Exception:
            raise serializers.ValidationError('Invalid base64 encoding.')
        try:
            img = Image.open(BytesIO(image_bytes))
            img.verify()
        except Exception:
            raise serializers.ValidationError('The provided file is not a valid image.')
        return value

    def process_image(self):
        """Return a BytesIO containing the resized JPEG."""
        raw = self.validated_data['base64_image']
        if ',' in raw:
            raw = raw.split(',', 1)[1]
        image_bytes = base64.b64decode(raw)

        img = Image.open(BytesIO(image_bytes))
        if img.mode not in ('RGB',):
            img = img.convert('RGB')

        img.thumbnail(self.max_size, Image.Resampling.LANCZOS)

        output = BytesIO()
        img.save(output, format='JPEG', quality=self.quality, optimize=True)
        output.seek(0)
        return output

    def save_to_field(self, image_field, filename):
        """
        Process the image and save it to a Django ImageField / FileField.

        Usage:
            serializer.save_to_field(instance.avatar, 'avatar_42.jpg')
            instance.save(update_fields=['avatar'])
        """
        output = self.process_image()
        image_field.save(filename, ContentFile(output.read()), save=False)
PYEOF
}

gen_core_admin_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
from django.contrib import admin

from .models import BasePicture

# Register your core models here.
# Example:
# @admin.register(MyModel)
# class MyModelAdmin(admin.ModelAdmin):
#     list_display = ('name', 'enabled', 'created')
#     list_filter = ('enabled',)
PYEOF
}

gen_core_cache_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
from django.core.cache import cache


def invalidate_pattern(pattern):
    """Delete all keys matching a glob pattern (Redis only; silently skipped on LocMemCache)."""
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        pass
PYEOF
}

gen_users_apps_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
from django.apps import AppConfig


class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'users'

    def ready(self):
        import users.signals  # noqa: F401
PYEOF
}

gen_users_models_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"

  cat > "$out" << 'PYEOF'
from django.contrib.auth.models import User
from django.db import models
PYEOF

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'

import uuid
from datetime import timedelta
PYEOF
  fi

  cat >> "$out" << 'PYEOF'


def profile_picture_upload_path(instance, filename):
    return f'profile_pictures/{filename}'


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    profile_picture = models.ImageField(
        upload_to=profile_picture_upload_path,
        null=True,
        blank=True,
    )

    def __str__(self):
        return f'Profile of {self.user.username}'
PYEOF

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'


class EmailVerificationToken(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='email_verification_token')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        from django.conf import settings
        from django.utils import timezone
        expiry_hours = getattr(settings, 'EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS', 24)
        return timezone.now() > self.created_at + timedelta(hours=expiry_hours)

    def __str__(self):
        return f'EmailVerificationToken for {self.user.username}'


class PasswordResetToken(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='password_reset_token')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        from django.conf import settings
        from django.utils import timezone
        expiry_hours = getattr(settings, 'PASSWORD_RESET_TOKEN_EXPIRY_HOURS', 1)
        return timezone.now() > self.created_at + timedelta(hours=expiry_hours)

    def __str__(self):
        return f'PasswordResetToken for {self.user.username}'
PYEOF
  fi

  if [[ "${include_passkey}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'


class PasskeyCredential(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='passkey_credentials')
    credential_id = models.CharField(max_length=512, unique=True)
    public_key = models.BinaryField()
    sign_count = models.PositiveIntegerField(default=0)
    transports = models.JSONField(default=list, blank=True)
    name = models.CharField(max_length=64, default='My passkey')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Passkey '{self.name}' for {self.user.email}"
PYEOF
  fi
}

gen_users_signals_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import UserProfile


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()
PYEOF
}

gen_users_serializers_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"

  cat > "$out" << 'PYEOF'
import uuid

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.serializers import ImageProcessingSerializer
from .models import UserProfile


def build_username(email: str) -> str:
    """Derive a stable Django username from an email address."""
    if len(email) <= 150:
        return email
    import hashlib
    return email[:100] + hashlib.md5(email.encode()).hexdigest()[:50]


class SignUpSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(required=False, allow_blank=True, default='')
    last_name = serializers.CharField(required=False, allow_blank=True, default='')
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True, label='Confirm password')

    def validate_email(self, value):
        username = build_username(value)
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        email = validated_data['email']
        password = validated_data.pop('password')
        username = build_username(email)
        user = User(
            username=username,
            email=email,
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        user.set_password(password)
        user.is_active = False
        user.save()
        UserProfile.objects.get_or_create(user=user)
        return user
PYEOF

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'

class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            user = User.objects.get(email=value, is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError('No active account found with this email.')
        self._user = user
        return value

    def get_user(self):
        return self._user


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    new_password = serializers.CharField(write_only=True)
    new_password2 = serializers.CharField(write_only=True)

    def validate(self, data):
        if data['new_password'] != data['new_password2']:
            raise serializers.ValidationError({'new_password2': 'Passwords do not match.'})
        return data


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            user = User.objects.get(email=value)
            if user.is_active:
                raise serializers.ValidationError('Account is already verified.')
        except User.DoesNotExist:
            raise serializers.ValidationError('No account found with this email.')
        return value
PYEOF
  fi

  cat >> "$out" << 'PYEOF'

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop('username', None)
        self.fields['email'] = serializers.EmailField(write_only=True)

    def validate(self, attrs):
        email = attrs.pop('email', '')
        try:
            user = User.objects.get(email=email, is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError(
                {'detail': 'No active account found with the given credentials.'}
            )
        attrs['username'] = user.username
        return super().validate(attrs)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        return token


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name')

    def validate_email(self, value):
        user = self.instance
        if User.objects.exclude(pk=user.pk).filter(email=value).exists():
            raise serializers.ValidationError('Email already in use.')
        return value


class UserProfileSerializer(serializers.ModelSerializer):
    profile_picture = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'profile_picture')

    def get_profile_picture(self, obj):
        try:
            picture = obj.profile.profile_picture
            if not picture:
                return None
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(picture.url)
            return picture.url
        except UserProfile.DoesNotExist:
            return None


class ProfilePictureSerializer(ImageProcessingSerializer):
    def save(self, user):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if profile.profile_picture:
            profile.profile_picture.delete(save=False)
        self.save_to_field(profile.profile_picture, f'{uuid.uuid4().hex}.jpg')
        profile.save(update_fields=['profile_picture'])
        return profile
PYEOF

  if [[ "${include_passkey}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'


# ── Passkey serializers ───────────────────────────────────────────────────────

class PasskeyAuthenticationOptionsSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasskeyAuthenticationVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    credential = serializers.JSONField()
    challenge_id = serializers.CharField()


class PasskeyRegistrationVerifySerializer(serializers.Serializer):
    credential = serializers.JSONField()
    challenge_id = serializers.CharField()
    name = serializers.CharField(max_length=64, default='My passkey', required=False)
PYEOF
  fi
}

gen_users_views_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"

  cat > "$out" << 'PYEOF'
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
PYEOF

  if [[ "${include_passkey}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'
from django.conf import settings
PYEOF
  fi

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

from .models import EmailVerificationToken, PasswordResetToken
from .serializers import (
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ResendVerificationSerializer,
)
PYEOF
  fi

  if [[ "${include_passkey}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'
import json
import uuid

from django.core.cache import cache
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from .models import PasskeyCredential
from .serializers import (
    CustomTokenObtainPairSerializer,
    PasskeyAuthenticationOptionsSerializer,
    PasskeyAuthenticationVerifySerializer,
    PasskeyRegistrationVerifySerializer,
)

WEBAUTHN_CHALLENGE_TTL = 300  # 5 minutes


def _get_rp_id_and_origin():
    return settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_RP_ORIGIN

PYEOF
  fi

  cat >> "$out" << 'PYEOF'
from .serializers import (
    CustomTokenObtainPairSerializer,
    ProfilePictureSerializer,
    SignUpSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
)
PYEOF

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'

def _send_verification_email(user, token):
    try:
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        verification_url = f'{frontend_url}/verify-email/{token.token}'
        subject = 'Verify your email address'
        message = render_to_string('users/verification_email.txt', {
            'first_name': user.first_name or user.username,
            'verification_url': verification_url,
            'expiry_hours': settings.EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
        })
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email])
        return True
    except Exception:
        return False


def _send_password_reset_email(user, token):
    try:
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        reset_url = f'{frontend_url}/reset-password/{token.token}'
        subject = 'Reset your password'
        message = render_to_string('users/password_reset_email.txt', {
            'first_name': user.first_name or user.username,
            'reset_url': reset_url,
            'expiry_hours': settings.PASSWORD_RESET_TOKEN_EXPIRY_HOURS,
        })
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email])
        return True
    except Exception:
        return False
PYEOF
  fi

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'

class SignUpView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = EmailVerificationToken.objects.create(user=user)
        email_sent = _send_verification_email(user, token)
        return Response(
            {
                'id': user.id,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'email_sent': email_sent,
                'detail': 'Account created. Please verify your email to activate your account.',
            },
            status=status.HTTP_201_CREATED,
        )
PYEOF
  else
    cat >> "$out" << 'PYEOF'

class SignUpView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                'id': user.id,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'detail': 'Account created successfully.',
            },
            status=status.HTTP_201_CREATED,
        )
PYEOF
  fi

  cat >> "$out" << 'PYEOF'


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = CustomTokenObtainPairSerializer


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    def put(self, request):
        serializer = UserProfileUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserProfileSerializer(request.user, context={'request': request}).data)

    def delete(self, request):
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfilePictureView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ProfilePictureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save(user=request.user)
        picture_url = None
        if profile.profile_picture:
            picture_url = request.build_absolute_uri(profile.profile_picture.url)
        return Response({'profile_picture': picture_url})
PYEOF

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            verification = EmailVerificationToken.objects.get(token=token)
        except EmailVerificationToken.DoesNotExist:
            return Response({'detail': 'Invalid or expired token.'}, status=status.HTTP_400_BAD_REQUEST)

        user = verification.user
        if user.is_active:
            verification.delete()
            return Response({'detail': 'Account already verified.'})

        if verification.is_expired():
            verification.delete()
            return Response({'detail': 'Token has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        user.is_active = True
        user.save(update_fields=['is_active'])
        verification.delete()
        return Response({'detail': 'Email verified successfully.'})


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        generic_response = Response(
            {'detail': 'If the email exists and is unverified, a new link has been sent.'}
        )
        if not serializer.is_valid():
            return generic_response

        email = serializer.validated_data['email']
        try:
            user = User.objects.get(email=email, is_active=False)
            EmailVerificationToken.objects.filter(user=user).delete()
            token = EmailVerificationToken.objects.create(user=user)
            _send_verification_email(user, token)
        except User.DoesNotExist:
            pass
        return generic_response


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        generic_response = Response(
            {'detail': 'If the account exists, a reset link has been sent.'}
        )
        if not serializer.is_valid():
            return generic_response

        user = serializer.get_user()
        PasswordResetToken.objects.filter(user=user).delete()
        token = PasswordResetToken.objects.create(user=user)
        _send_password_reset_email(user, token)
        return generic_response


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token_obj = PasswordResetToken.objects.select_related('user').get(
                token=serializer.validated_data['token']
            )
        except PasswordResetToken.DoesNotExist:
            return Response({'detail': 'Invalid or expired token.'}, status=status.HTTP_400_BAD_REQUEST)

        if token_obj.is_expired():
            token_obj.delete()
            return Response({'detail': 'Token has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        user = token_obj.user
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        token_obj.delete()
        return Response({'detail': 'Password reset successful.'})
PYEOF
  fi

  if [[ "${include_passkey}" == "y" ]]; then
    cat >> "$out" << 'PYEOF'


# ── Passkey (WebAuthn) views ─────────────────────────────────────────────────


class PasskeyRegistrationOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        rp_id, rp_origin = _get_rp_id_and_origin()

        existing_credentials = [
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
            for c in PasskeyCredential.objects.filter(user=request.user)
        ]

        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=settings.WEBAUTHN_RP_NAME,
            user_name=request.user.email,
            user_id=str(request.user.id).encode(),
            user_display_name=request.user.get_full_name() or request.user.email,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            exclude_credentials=existing_credentials,
        )

        challenge_id = uuid.uuid4().hex
        cache.set(f'webauthn:reg:{challenge_id}', options.challenge, WEBAUTHN_CHALLENGE_TTL)

        return Response({
            'options': json.loads(options_to_json(options)),
            'challenge_id': challenge_id,
        })


class PasskeyRegistrationVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasskeyRegistrationVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        challenge_id = serializer.validated_data['challenge_id']
        challenge = cache.get(f'webauthn:reg:{challenge_id}')
        if challenge is None:
            return Response(
                {'detail': 'Challenge expired or invalid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(f'webauthn:reg:{challenge_id}')

        rp_id, rp_origin = _get_rp_id_and_origin()

        try:
            verification = verify_registration_response(
                credential=serializer.validated_data['credential'],
                expected_challenge=challenge,
                expected_rp_id=rp_id,
                expected_origin=rp_origin,
            )
        except Exception as e:
            return Response(
                {'detail': f'Registration verification failed: {e}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        credential = PasskeyCredential.objects.create(
            user=request.user,
            credential_id=bytes_to_base64url(verification.credential_id),
            public_key=verification.credential_public_key,
            sign_count=verification.sign_count,
            name=serializer.validated_data.get('name', 'My passkey'),
        )

        return Response(
            {'id': credential.id, 'name': credential.name},
            status=status.HTTP_201_CREATED,
        )


class PasskeyAuthenticationOptionsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasskeyAuthenticationOptionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        rp_id, rp_origin = _get_rp_id_and_origin()

        allow_credentials = []
        try:
            from .serializers import build_username
            user = User.objects.get(username=build_username(email), is_active=True)
            allow_credentials = [
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
                for c in PasskeyCredential.objects.filter(user=user)
            ]
        except User.DoesNotExist:
            pass

        options = generate_authentication_options(
            rp_id=rp_id,
            allow_credentials=allow_credentials,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        challenge_id = uuid.uuid4().hex
        cache.set(f'webauthn:auth:{challenge_id}', options.challenge, WEBAUTHN_CHALLENGE_TTL)

        return Response({
            'options': json.loads(options_to_json(options)),
            'challenge_id': challenge_id,
        })


class PasskeyAuthenticationVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasskeyAuthenticationVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        challenge_id = serializer.validated_data['challenge_id']

        challenge = cache.get(f'webauthn:auth:{challenge_id}')
        if challenge is None:
            return Response(
                {'detail': 'Challenge expired or invalid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(f'webauthn:auth:{challenge_id}')

        rp_id, rp_origin = _get_rp_id_and_origin()

        from .serializers import build_username
        try:
            user = User.objects.get(username=build_username(email), is_active=True)
        except User.DoesNotExist:
            return Response({'detail': 'Authentication failed.'}, status=status.HTTP_401_UNAUTHORIZED)

        credential_data = serializer.validated_data['credential']
        credential_id_b64 = credential_data.get('id', '')

        try:
            stored = PasskeyCredential.objects.get(credential_id=credential_id_b64, user=user)
        except PasskeyCredential.DoesNotExist:
            return Response({'detail': 'Authentication failed.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            verification = verify_authentication_response(
                credential=credential_data,
                expected_challenge=challenge,
                expected_rp_id=rp_id,
                expected_origin=rp_origin,
                credential_public_key=bytes(stored.public_key),
                credential_current_sign_count=stored.sign_count,
            )
        except Exception:
            return Response({'detail': 'Authentication failed.'}, status=status.HTTP_401_UNAUTHORIZED)

        stored.sign_count = verification.new_sign_count
        stored.save(update_fields=['sign_count'])

        token = CustomTokenObtainPairSerializer.get_token(user)
        return Response({
            'access': str(token.access_token),
            'refresh': str(token),
        })


class PasskeyCredentialListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        creds = PasskeyCredential.objects.filter(user=request.user).order_by('-created_at')
        return Response({
            'count': creds.count(),
            'credentials': [
                {'id': c.id, 'name': c.name, 'created_at': c.created_at}
                for c in creds
            ],
        })


class PasskeyCredentialDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            cred = PasskeyCredential.objects.get(pk=pk, user=request.user)
        except PasskeyCredential.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        cred.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
PYEOF
  fi
}

gen_users_urls_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"

  local email_imports="" passkey_imports=""
  local email_paths="" passkey_paths=""

  if [[ "${include_email}" == "y" ]]; then
    email_imports="
    VerifyEmailView,
    ResendVerificationView,
    PasswordResetRequestView,
    PasswordResetConfirmView,"
    email_paths="    path('verify-email/<uuid:token>/', VerifyEmailView.as_view(), name='auth-verify-email'),
    path('resend-verification/', ResendVerificationView.as_view(), name='auth-resend-verification'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='auth-password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),"
  fi

  if [[ "${include_passkey}" == "y" ]]; then
    passkey_imports="
    PasskeyRegistrationOptionsView,
    PasskeyRegistrationVerifyView,
    PasskeyAuthenticationOptionsView,
    PasskeyAuthenticationVerifyView,
    PasskeyCredentialListView,
    PasskeyCredentialDetailView,"
    passkey_paths="    # Passkey
    path('passkey/register/options/', PasskeyRegistrationOptionsView.as_view(), name='passkey-register-options'),
    path('passkey/register/verify/', PasskeyRegistrationVerifyView.as_view(), name='passkey-register-verify'),
    path('passkey/authenticate/options/', PasskeyAuthenticationOptionsView.as_view(), name='passkey-auth-options'),
    path('passkey/authenticate/verify/', PasskeyAuthenticationVerifyView.as_view(), name='passkey-auth-verify'),
    path('passkey/credentials/', PasskeyCredentialListView.as_view(), name='passkey-credentials'),
    path('passkey/credentials/<int:pk>/', PasskeyCredentialDetailView.as_view(), name='passkey-credential-detail'),"
  fi

  cat > "$out" << EOF
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import (
    SignUpView,
    LoginView,
    ProfileView,
    ProfilePictureView,${email_imports}${passkey_imports}
)

urlpatterns = [
    path('signup/', SignUpView.as_view(), name='auth-signup'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('token/verify/', TokenVerifyView.as_view(), name='auth-token-verify'),
    path('profile/', ProfileView.as_view(), name='auth-profile'),
    path('profile/picture/', ProfilePictureView.as_view(), name='auth-profile-picture'),
${email_paths}
${passkey_paths}
]
EOF
}

gen_users_admin_py() {
  local out="$1"
  mkdir -p "$(dirname "$out")"

  local passkey_import="" passkey_admin=""
  if [[ "${include_passkey}" == "y" ]]; then
    passkey_import=", PasskeyCredential"
    passkey_admin="

@admin.register(PasskeyCredential)
class PasskeyCredentialAdmin(admin.ModelAdmin):
    list_display = ('user', 'name', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__email', 'name')
    readonly_fields = ('credential_id', 'sign_count', 'created_at')"
  fi

  cat > "$out" << EOF
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import UserProfile${passkey_import}


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)
${passkey_admin}

admin.site.unregister(User)
admin.site.register(User, UserAdmin)
EOF
}

gen_migration_0001() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
# Generated migration

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='UserProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('profile_picture', models.ImageField(blank=True, null=True, upload_to='profile_pictures/')),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='profile',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
PYEOF
}

gen_migration_0002_email() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
# Generated migration

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailVerificationToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.UUIDField(default=uuid.uuid4, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='email_verification_token',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
PYEOF
}

gen_migration_0003_password_reset() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
# Generated migration

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_emailverificationtoken'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PasswordResetToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.UUIDField(default=uuid.uuid4, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='password_reset_token',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
PYEOF
}

gen_migration_0004_passkey() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'PYEOF'
# Generated migration

import django.db.models.deletion
import users.models
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_passwordresettoken'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='emailverificationtoken',
            name='token',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AlterField(
            model_name='passwordresettoken',
            name='token',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AlterField(
            model_name='userprofile',
            name='profile_picture',
            field=models.ImageField(blank=True, null=True, upload_to=users.models.profile_picture_upload_path),
        ),
        migrations.CreateModel(
            name='PasskeyCredential',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('credential_id', models.CharField(max_length=512, unique=True)),
                ('public_key', models.BinaryField()),
                ('sign_count', models.PositiveIntegerField(default=0)),
                ('transports', models.JSONField(blank=True, default=list)),
                ('name', models.CharField(default='My passkey', max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='passkey_credentials', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
PYEOF
}

gen_verification_email_txt() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'EOF'
Hi {{ first_name }},

Please verify your email by clicking the link below:

{{ verification_url }}

This link expires in {{ expiry_hours }} hours.

If you did not create an account, ignore this email.
EOF
}

gen_password_reset_email_txt() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'EOF'
Hi {{ first_name }},

We received a request to reset your password. Click the link below to choose a new one:

{{ reset_url }}

This link expires in {{ expiry_hours }} hour(s).

If you did not request a password reset, ignore this email. Your password will not change.
EOF
}

gen_env_example() {
  local out="$1"
  local media_comment
  [[ "${include_r2}" == "y" ]] && media_comment="# Media (local dev — ignored when R2_ACCOUNT_ID is set)" || media_comment="# Media"
  mkdir -p "$(dirname "$out")"

  cat > "$out" << EOF
# Docker / Helm
DOCKER_REGISTRY=${registry_user}
NAMESPACE=${name}

# Django
SECRET_KEY=django-insecure-change-me
DEBUG=True
ALLOWED_HOSTS=*
DJANGO_SETTINGS_MODULE=${module_name}.settings

# CORS / CSRF
CORS_ALLOWED_ORIGINS=${frontend_url}
CSRF_TRUSTED_ORIGINS=https://${host},${frontend_url}
FRONTEND_URL=${frontend_url}

# Database (leave DB_HOST empty to use SQLite locally)
DB_HOST=
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=

${media_comment}
MEDIA_ROOT=/app/media
EOF

  if [[ "${include_r2}" == "y" ]]; then
    cat >> "$out" << 'EOF'

# Cloudflare R2 storage (leave R2_ACCOUNT_ID empty to use local filesystem)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_DOMAIN=
EOF
  fi

  if [[ "${include_redis}" == "y" ]]; then
    cat >> "$out" << EOF
REDIS_URL=redis://redis.${name}.svc.cluster.local:6379/0
REDIS_PASSWORD=
EOF
  fi

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'EOF'
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_HOST=smtp.ionos.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EOF
  fi

  if [[ "${include_passkey}" == "y" ]]; then
    local passkey_rp_name
    passkey_rp_name="$(to_title_case "${name}")"
    cat >> "$out" << EOF

# WebAuthn / Passkeys
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=${passkey_rp_name}
WEBAUTHN_RP_ORIGIN=http://localhost:3000
EOF
  fi
}

gen_helm_chart_yaml() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
apiVersion: v2
name: ${name}
description: Helm chart for the Django ${name} application
type: application
version: 0.1.0
appVersion: '0.1.0'
EOF
}

gen_helm_values_yaml() {
  local out="$1"
  local title
  title="$(to_title_case "${name}")"
  mkdir -p "$(dirname "$out")"

  cat > "$out" << EOF
# ─────────────────────────────────────────────────────────────
# ${title} Application – Helm Values
# ─────────────────────────────────────────────────────────────

revisionHistoryLimit: 2
replicaCount: 1

# ─── Container image ────────────────────────────────────────
image:
  repository: ${registry_user}/${name}
  tag: 'latest'
  pullPolicy: IfNotPresent

imagePullSecrets: []

# ─── Name overrides ─────────────────────────────────────────
nameOverride: ''
fullnameOverride: ''

# ─── Service ────────────────────────────────────────────────
service:
  type: ClusterIP
  port: 80
  targetPort: 8000

# ─── Ingress ────────────────────────────────────────────────
ingress:
  enabled: true
  className: 'nginx'
  annotations:
    cert-manager.io/cluster-issuer: 'letsencrypt-prod'
  hosts:
    - host: ${host}
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ${name}-tls
      hosts:
        - ${host}

# ─── Environment variables ──────────────────────────────────
# Non-secret vars not present in env.example / the k8s secret.
env:
EOF

  if [[ "${include_email}" == "y" ]]; then
    cat >> "$out" << 'YAMLEOF'
  EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS: '24'
YAMLEOF
  fi

  cat >> "$out" << 'YAMLEOF'
  GUNICORN_WORKERS: '3'

# Load all env.example variables from the pre-existing secret.
# Keys in the secret match env.example names exactly.
YAMLEOF

  if [[ "${include_r2}" == "y" ]]; then
    cat >> "$out" << 'YAMLEOF'
# R2 vars to add to the secret when enabling R2 storage:
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_DOMAIN
YAMLEOF
  fi

  cat >> "$out" << EOF
envFrom:
  - secretRef:
      name: ${name}-secrets

# ─── Health probes ──────────────────────────────────────────
probes:
  startupProbe:
    httpGet:
      path: /admin/
      port: 8000
    initialDelaySeconds: 15
    periodSeconds: 5
    failureThreshold: 30

  livenessProbe:
    httpGet:
      path: /admin/
      port: 8000
    periodSeconds: 10
    failureThreshold: 3

# ─── Node affinity ──────────────────────────────────────────
nodeAffinity:
  enabled: false
  nodeNames: []

# ─── Resources ──────────────────────────────────────────────
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
EOF
}

gen_helm_helpers_tpl() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
{{/*
Expand the name of the chart.
*/}}
{{- define "${name}.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "${name}.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- \$name := default .Chart.Name .Values.nameOverride }}
{{- if contains \$name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name \$name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version for the chart label.
*/}}
{{- define "${name}.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "${name}.labels" -}}
helm.sh/chart: {{ include "${name}.chart" . }}
{{ include "${name}.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "${name}.selectorLabels" -}}
app.kubernetes.io/name: {{ include "${name}.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
EOF
}

gen_helm_deployment_yaml() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  revisionHistoryLimit: {{ .Values.revisionHistoryLimit }}
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "${name}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${name}.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}

      {{- if .Values.nodeAffinity.enabled }}
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values:
                      {{- toYaml .Values.nodeAffinity.nodeNames | nindent 22 }}
      {{- end }}

      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}

          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP

          {{- if .Values.envFrom }}
          envFrom:
            {{- toYaml .Values.envFrom | nindent 12 }}
          {{- end }}
          {{- if .Values.env }}
          env:
            {{- range \$key, \$value := .Values.env }}
            - name: {{ \$key }}
              value: {{ \$value | quote }}
            {{- end }}
          {{- end }}

          startupProbe:
            httpGet:
              path: {{ .Values.probes.startupProbe.httpGet.path }}
              port: {{ .Values.probes.startupProbe.httpGet.port }}
            initialDelaySeconds: {{ .Values.probes.startupProbe.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.startupProbe.periodSeconds }}
            failureThreshold: {{ .Values.probes.startupProbe.failureThreshold }}

          livenessProbe:
            httpGet:
              path: {{ .Values.probes.livenessProbe.httpGet.path }}
              port: {{ .Values.probes.livenessProbe.httpGet.port }}
            periodSeconds: {{ .Values.probes.livenessProbe.periodSeconds }}
            failureThreshold: {{ .Values.probes.livenessProbe.failureThreshold }}

          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}

EOF
}

gen_helm_service_yaml() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
apiVersion: v1
kind: Service
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.targetPort }}
      protocol: TCP
      name: http
  selector:
    {{- include "${name}.selectorLabels" . | nindent 4 }}
EOF
}

gen_helm_ingress_yaml() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - secretName: {{ .secretName }}
      hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- \$paths := .paths | default (list (dict "path" "/" "pathType" "Prefix")) }}
          {{- range \$paths }}
          - path: {{ .path }}
            pathType: {{ .pathType | default "Prefix" }}
            backend:
              service:
                name: {{ include "${name}.fullname" \$ }}
                port:
                  number: {{ \$.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
EOF
}

gen_helm_notes_txt() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
──────────────────────────────────────────────────────────────
  {{ include "${name}.fullname" . }} has been deployed!
──────────────────────────────────────────────────────────────

{{- if .Values.ingress.enabled }}
The application is accessible at:
{{- range .Values.ingress.hosts }}
  https://{{ .host }}
{{- end }}
{{- else }}

To access the application, run:

  kubectl port-forward svc/{{ include "${name}.fullname" . }} {{ .Values.service.port }}:{{ .Values.service.targetPort }}

Then open http://localhost:{{ .Values.service.port }} in your browser.
{{- end }}

Replicas: {{ .Values.replicaCount }}
EOF
}

gen_gitignore() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'EOF'
# Python
__pycache__/
*.py[cod]
*.pyo
*.pyd
*.egg-info/
dist/
build/
*.egg

# Virtual environment
venv/
.venv/
env/

# Django
db.sqlite3
*.sqlite3
staticfiles/
media/

# Environment
.env
*.env.local

# Logs
*.log

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/
*.swp
*.swo
EOF
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  # ── Language ──────────────────────────────────────────────────────────────────
  local lang="en"
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  [[ "${raw_lang,,}" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  # ── Prerequisites ─────────────────────────────────────────────────────────────
  check_prerequisites

  # ── Repo root ─────────────────────────────────────────────────────────────────
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  local repo_root
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  # ── [1/2] Configuration ───────────────────────────────────────────────────────
  echo ""
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_CONFIG} ──")"

  # App name
  local name=""
  while true; do
    name="$(prompt_visible "${APP_NAME_PROMPT}")"
    echo ""
    local err
    err="$(validate_app_name "${name}")"
    if [[ -z "${err}" ]]; then break; fi
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${err}"
  done

  # Module name
  local default_module
  default_module="$(to_module_name "${name}")"
  local module_name
  module_name="$(prompt_visible "${MODULE_PROMPT}" "${default_module}")"
  echo ""

  # Host
  local default_host="${name}.iguzman.com.mx"
  local host
  host="$(prompt_visible "${HOST_PROMPT}" "${default_host}")"
  echo ""

  # Frontend URL
  local default_frontend="https://${name%-api}.iguzman.com.mx"
  local frontend_url
  frontend_url="$(prompt_visible "${FRONTEND_PROMPT}" "${default_frontend}")"
  echo ""

  # Feature flags
  local include_redis="n" include_email="n" include_passkey="n" include_r2="n"

  echo ""
  if confirm_yn "${REDIS_PROMPT}" "y"; then include_redis="y"; fi
  echo ""

  if confirm_yn "${EMAIL_PROMPT}" "y"; then include_email="y"; fi
  echo ""

  if [[ "${include_email}" == "y" && "${include_redis}" == "y" ]]; then
    if confirm_yn "${PASSKEY_PROMPT}" "y"; then include_passkey="y"; fi
    echo ""
  fi

  if confirm_yn "${R2_PROMPT}" "y"; then include_r2="y"; fi
  echo ""

  # Docker registry
  local registry_user
  registry_user="$(prompt_visible "${REGISTRY_PROMPT}" "my-username")"
  echo ""

  # ── [2/2] Generate files ──────────────────────────────────────────────────────
  local app_dir="${repo_root}/apps/${name}"

  echo ""
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_FILES} ──")"
  printf "  %s %s\n\n" "$(clr_bold_yellow '→')" "${CREATING} apps/${name}..."

  # Root files
  gen_gitignore      "${app_dir}/.gitignore"
  gen_package_json   "${app_dir}/package.json"
  gen_requirements_txt "${app_dir}/requirements.txt"
  gen_manage_py      "${app_dir}/manage.py"
  gen_entrypoint_sh  "${app_dir}/entrypoint.sh"
  gen_gunicorn_conf_py "${app_dir}/gunicorn.conf.py"
  gen_dockerfile     "${app_dir}/Dockerfile"
  gen_env_example    "${app_dir}/.env"
  gen_env_example    "${app_dir}/env.example"

  # Django project package
  gen_init_py        "${app_dir}/${module_name}/__init__.py"
  gen_settings_py    "${app_dir}/${module_name}/settings.py"
  gen_urls_py        "${app_dir}/${module_name}/urls.py"
  gen_wsgi_py        "${app_dir}/${module_name}/wsgi.py"
  gen_asgi_py        "${app_dir}/${module_name}/asgi.py"

  # Core app
  gen_init_py            "${app_dir}/core/__init__.py"
  gen_core_apps_py       "${app_dir}/core/apps.py"
  gen_core_admin_py      "${app_dir}/core/admin.py"
  gen_core_fields_py     "${app_dir}/core/fields.py"
  gen_core_models_py     "${app_dir}/core/models.py"
  gen_core_serializers_py "${app_dir}/core/serializers.py"
  gen_init_py            "${app_dir}/core/migrations/__init__.py"
  [[ "${include_redis}" == "y" ]] && gen_core_cache_py "${app_dir}/core/cache.py" || true

  # Users app
  gen_init_py            "${app_dir}/users/__init__.py"
  gen_users_apps_py      "${app_dir}/users/apps.py"
  gen_users_admin_py     "${app_dir}/users/admin.py"
  gen_users_models_py    "${app_dir}/users/models.py"
  gen_users_signals_py   "${app_dir}/users/signals.py"
  gen_users_serializers_py "${app_dir}/users/serializers.py"
  gen_users_views_py     "${app_dir}/users/views.py"
  gen_users_urls_py      "${app_dir}/users/urls.py"
  gen_init_py            "${app_dir}/users/migrations/__init__.py"
  gen_migration_0001     "${app_dir}/users/migrations/0001_initial.py"

  if [[ "${include_email}" == "y" ]]; then
    gen_migration_0002_email           "${app_dir}/users/migrations/0002_emailverificationtoken.py"
    gen_migration_0003_password_reset  "${app_dir}/users/migrations/0003_passwordresettoken.py"
    gen_verification_email_txt         "${app_dir}/users/templates/users/verification_email.txt"
    gen_password_reset_email_txt       "${app_dir}/users/templates/users/password_reset_email.txt"
  fi

  if [[ "${include_passkey}" == "y" ]]; then
    gen_migration_0004_passkey "${app_dir}/users/migrations/0004_passkeycredential.py"
  fi

  # Empty media + staticfiles directories
  mkdir -p "${app_dir}/media" "${app_dir}/staticfiles"

  # Helm chart
  gen_helm_chart_yaml      "${app_dir}/helm/Chart.yaml"
  gen_helm_values_yaml     "${app_dir}/helm/values.yaml"
  gen_helm_helpers_tpl     "${app_dir}/helm/templates/_helpers.tpl"
  gen_helm_deployment_yaml "${app_dir}/helm/templates/deployment.yaml"
  gen_helm_service_yaml    "${app_dir}/helm/templates/service.yaml"
  gen_helm_ingress_yaml    "${app_dir}/helm/templates/ingress.yaml"
  gen_helm_notes_txt       "${app_dir}/helm/templates/NOTES.txt"

  printf "  %s %s\n" "$(clr_bold_green '✓')" "All files written."

  # ── [3/3] Environment setup ───────────────────────────────────────────────────
  echo ""
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_SETUP} ──")"

  printf "  %s  %s\n" "$(clr_bold_yellow '→')" "${SETUP_VENV}"
  python3 -m venv "${app_dir}/venv"
  printf "  %s  %s\n\n" "$(clr_bold_green '✓')" "${SETUP_VENV_DONE}"

  printf "  %s  %s\n" "$(clr_bold_yellow '→')" "${SETUP_DEPS}"
  "${app_dir}/venv/bin/pip" install -r "${app_dir}/requirements.txt"
  printf "  %s  %s\n\n" "$(clr_bold_green '✓')" "${SETUP_DEPS_DONE}"

  printf "  %s  %s\n\n" "$(clr_bold_yellow '→')" "${SETUP_MIGRATE}"
  (cd "${app_dir}" && "${app_dir}/venv/bin/python" manage.py migrate --noinput)
  printf "  %s  %s\n\n" "$(clr_bold_green '✓')" "${SETUP_MIGRATE_DONE}"

  printf "  %s  %s\n\n" "$(clr_bold_yellow '→')" "${SETUP_SUPERUSER}"
  (cd "${app_dir}" && "${app_dir}/venv/bin/python" manage.py createsuperuser)
  echo ""

  # ── Summary ───────────────────────────────────────────────────────────────────
  local sep
  sep="$(printf '─%.0s' {1..53})"
  echo ""
  printf "\n  %s\n" "$(clr_bold_cyan "── ${DONE_MSG} ${sep:${#DONE_MSG}}")"
  printf "  %-22s %s\n" "$(clr_dim "${LBL_MODULE}:")"   "$(clr_bold "${module_name}")"
  printf "  %-22s %s\n" "$(clr_dim "${LBL_HOST}:")"     "${host}"
  printf "  %-22s %s\n" "$(clr_dim "${LBL_FRONTEND}:")" "${frontend_url}"
  printf "  %-22s %s\n" "$(clr_dim "${LBL_REDIS}:")"    "$([[ "${include_redis}"   == 'y' ]] && echo "${YES_STR}" || echo "${NO_STR}")"
  printf "  %-22s %s\n" "$(clr_dim "${LBL_EMAIL}:")"    "$([[ "${include_email}"   == 'y' ]] && echo "${YES_STR}" || echo "${NO_STR}")"
  printf "  %-22s %s\n" "$(clr_dim "${LBL_PASSKEYS}:")" "$([[ "${include_passkey}" == 'y' ]] && echo "${YES_STR} (WebAuthn)" || echo "${NO_STR}")"
  printf "  %-22s %s\n" "$(clr_dim "${LBL_R2}:")"       "$([[ "${include_r2}"      == 'y' ]] && echo "${YES_STR} (Cloudflare R2)" || echo "${NO_STR}")"
  printf "  %-22s %s\n" "$(clr_dim "${LBL_REGISTRY}:")" "${registry_user}/${name}"
  echo ""

  # ── Next steps ────────────────────────────────────────────────────────────────
  printf "  %s\n" "$(clr_bold_cyan "── ${NEXT_STEPS} ──")"
  printf "  %s  %s\n" "$(clr_dim '1.')" "cd apps/${name} && source venv/bin/activate"
  printf "  %s  %s\n" "$(clr_dim '2.')" "python3 manage.py runserver"
  printf "  %s  %s\n" "$(clr_dim '3.')" "Update .env with your secrets before deploying"
  echo ""
  printf "  %s\n\n" "$(clr_bold_green "✓ apps/${name} is ready!")"
}

main "$@"
