import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { APPS_DIR, createPrompt } from './utils.mjs';

// ── Update prompt ──────────────────────────────────────────────────────
// Update new-django-app.mjs to reflect changes made in apps/website-api and its configs

// ── Helpers ────────────────────────────────────────────────────────────

function validateAppName(name) {
  if (!name) return 'App name is required.';
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    return 'Name must start with a letter and contain only lowercase letters, numbers, and hyphens.';
  if (existsSync(join(APPS_DIR, name)))
    return `Directory apps/${name} already exists.`;
  return null;
}

function toModuleName(name) {
  return name.replace(/-/g, '_');
}

function toTitleCase(str) {
  return str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function writeFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

// ── Template Functions ─────────────────────────────────────────────────

function packageJson(name) {
  const pkg = {
    name,
    version: '0.1.0',
    scripts: {
      venv: 'source venv/bin/activate',
      requirements: 'pip install -r requirements.txt',
      static: 'python3 manage.py collectstatic --noinput',
      migrate: 'python3 manage.py migrate',
      migrations: 'python3 manage.py makemigrations',
      superuser: 'python3 manage.py createsuperuser',
      dev: 'python3 manage.py runserver',
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

function requirementsTxt(includeRedis, includeEmail, includePasskey) {
  const deps = [
    'Django==5.2.11',
    'djangorestframework==3.16.1',
    'djangorestframework_simplejwt==5.5.1',
    'Pillow==11.1.0',
    'whitenoise==6.9.0',
    'gunicorn==23.0.0',
    'psycopg[binary]==3.2.4',
    'django-colorfield==0.11.0',
    'django-cors-headers==4.9.0',
  ];
  if (includeRedis) deps.push('django-redis==5.4.0');
  if (includePasskey) deps.push('webauthn==2.7.1');
  return deps.join('\n') + '\n';
}

function managePy(moduleName) {
  return `#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', '${moduleName}.settings')
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
`.replace('${moduleName}', moduleName);
}

function entrypointSh() {
  return `#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec "$@"
`;
}

function settingsPy(moduleName, host, frontendUrl, includeRedis, includeEmail, includePasskey) {
  const cacheSection = includeRedis
    ? `
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
`
    : `
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}
`;

  const emailSection = includeEmail
    ? `
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
`
    : '';

  return `import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

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
        'https://${host},${frontendUrl}',
    ).split(',')
    if origin.strip()
]

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        'CORS_ALLOWED_ORIGINS',
        '${frontendUrl}',
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

ROOT_URLCONF = '${moduleName}.urls'

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

WSGI_APPLICATION = '${moduleName}.wsgi.application'

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
${cacheSection}
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
${emailSection}${includePasskey ? `
WEBAUTHN_RP_ID = os.environ.get('WEBAUTHN_RP_ID', 'localhost')
WEBAUTHN_RP_NAME = os.environ.get('WEBAUTHN_RP_NAME', '${toTitleCase(moduleName)}')
WEBAUTHN_RP_ORIGIN = os.environ.get('WEBAUTHN_RP_ORIGIN', 'http://localhost:3000')
` : ''}`;
}

function urlsPy(moduleName) {
  return `from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api-auth/', include('rest_framework.urls')),
    path('api/auth/', include('users.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
`.replace('${moduleName}', moduleName);
}

function wsgiPy(moduleName) {
  return `import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', '${moduleName}.settings')
application = get_wsgi_application()
`.replace('${moduleName}', moduleName);
}

function asgiPy(moduleName) {
  return `import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', '${moduleName}.settings')
application = get_asgi_application()
`.replace('${moduleName}', moduleName);
}

function initPy() {
  return '';
}

// ── Core App ───────────────────────────────────────────────────────────

function coreAppsPy() {
  return `from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
`;
}

function coreFieldsPy() {
  return `import io

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
`;
}

function coreModelsPy() {
  return `import os
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
    \`\`picture_mixin()\`\`.
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
`;
}

function coreSerializersPy() {
  return `import base64
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
`;
}

// ── Users App ──────────────────────────────────────────────────────────

function usersAppsPy() {
  return `from django.apps import AppConfig


class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'users'

    def ready(self):
        import users.signals  # noqa: F401
`;
}

function usersModelsPy(includeEmail, includePasskey) {
  const emailModels = includeEmail
    ? `

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
        return f'PasswordResetToken for {self.user.username}'`
    : '';

  const passkeyModel = includePasskey
    ? `

class PasskeyCredential(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='passkey_credentials')
    credential_id = models.CharField(max_length=512, unique=True)
    public_key = models.BinaryField()
    sign_count = models.PositiveIntegerField(default=0)
    transports = models.JSONField(default=list, blank=True)
    name = models.CharField(max_length=64, default='My passkey')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Passkey '{self.name}' for {self.user.email}"`
    : '';

  const uuidImport = includeEmail
    ? '\nimport uuid\nfrom datetime import timedelta'
    : '';

  return `from django.contrib.auth.models import User
from django.db import models
${uuidImport}


def profile_picture_upload_path(instance, filename):
    return f'profile_pictures/{instance.user.id}/{filename}'


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    profile_picture = models.ImageField(
        upload_to=profile_picture_upload_path,
        null=True,
        blank=True,
    )

    def __str__(self):
        return f'Profile of {self.user.username}'
${emailModels}${passkeyModel}
`;
}

function usersSignalsPy() {
  return `from django.contrib.auth.models import User
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
`;
}

function usersSerializersPy(includeEmail, includePasskey) {
  const emailSerializers = includeEmail
    ? `

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
        return value`
    : '';

  const passkeySerializers = includePasskey
    ? `


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
    name = serializers.CharField(max_length=64, default='My passkey', required=False)`
    : '';

  return `from django.contrib.auth.models import User
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
${emailSerializers}

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
        self.save_to_field(profile.profile_picture, f'profile_{user.id}.jpg')
        profile.save(update_fields=['profile_picture'])
        return profile
${passkeySerializers}
`;
}

function usersViewsPy(includeEmail, includePasskey) {
  const emailViews = includeEmail
    ? `

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
        return Response({'detail': 'Password reset successful.'})`
    : '';

  const passkeyViews = includePasskey
    ? `


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
        return Response(status=status.HTTP_204_NO_CONTENT)`
    : '';

  const emailImports = includeEmail
    ? `from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

from .models import EmailVerificationToken, PasswordResetToken
from .serializers import (
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ResendVerificationSerializer,
)`
    : '';

  const passkeyImports = includePasskey
    ? `import json
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
`
    : '';

  const emailHelpers = includeEmail
    ? `

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
        return False`
    : '';

  const passkeySettingsImport = includePasskey ? `from django.conf import settings\n` : '';

  return `from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
${passkeySettingsImport}${emailImports}
${passkeyImports}
from .serializers import (
    CustomTokenObtainPairSerializer,
    ProfilePictureSerializer,
    SignUpSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
)
${emailHelpers}

class SignUpView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()${includeEmail ? `
        token = EmailVerificationToken.objects.create(user=user)
        email_sent = _send_verification_email(user, token)` : ''}
        return Response(
            {
                'id': user.id,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,${includeEmail ? `
                'email_sent': email_sent,` : ''}
                'detail': '${includeEmail ? 'Account created. Please verify your email to activate your account.' : 'Account created successfully.'}',
            },
            status=status.HTTP_201_CREATED,
        )


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
${emailViews}${passkeyViews}
`;
}

function usersUrlsPy(includeEmail, includePasskey) {
  const emailPaths = includeEmail
    ? `    path('verify-email/<uuid:token>/', VerifyEmailView.as_view(), name='auth-verify-email'),
    path('resend-verification/', ResendVerificationView.as_view(), name='auth-resend-verification'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='auth-password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),`
    : '';

  const passkeyPaths = includePasskey
    ? `    # Passkey
    path('passkey/register/options/', PasskeyRegistrationOptionsView.as_view(), name='passkey-register-options'),
    path('passkey/register/verify/', PasskeyRegistrationVerifyView.as_view(), name='passkey-register-verify'),
    path('passkey/authenticate/options/', PasskeyAuthenticationOptionsView.as_view(), name='passkey-auth-options'),
    path('passkey/authenticate/verify/', PasskeyAuthenticationVerifyView.as_view(), name='passkey-auth-verify'),
    path('passkey/credentials/', PasskeyCredentialListView.as_view(), name='passkey-credentials'),
    path('passkey/credentials/<int:pk>/', PasskeyCredentialDetailView.as_view(), name='passkey-credential-detail'),`
    : '';

  const emailImports = includeEmail
    ? `
    VerifyEmailView,
    ResendVerificationView,
    PasswordResetRequestView,
    PasswordResetConfirmView,`
    : '';

  const passkeyImports = includePasskey
    ? `
    PasskeyRegistrationOptionsView,
    PasskeyRegistrationVerifyView,
    PasskeyAuthenticationOptionsView,
    PasskeyAuthenticationVerifyView,
    PasskeyCredentialListView,
    PasskeyCredentialDetailView,`
    : '';

  return `from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import (
    SignUpView,
    LoginView,
    ProfileView,
    ProfilePictureView,${emailImports}${passkeyImports}
)

urlpatterns = [
    path('signup/', SignUpView.as_view(), name='auth-signup'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('token/verify/', TokenVerifyView.as_view(), name='auth-token-verify'),
    path('profile/', ProfileView.as_view(), name='auth-profile'),
    path('profile/picture/', ProfilePictureView.as_view(), name='auth-profile-picture'),
${emailPaths}
${passkeyPaths}
]
`;
}

// ── Migrations ─────────────────────────────────────────────────────────

function migration0001() {
  return `# Generated migration

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
`;
}

function migration0002Email() {
  return `# Generated migration

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
`;
}

function migration0003PasswordReset() {
  return `# Generated migration

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
`;
}

function migration0004Passkey() {
  return `# Generated migration

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
`;
}

// ── Email Templates ────────────────────────────────────────────────────

function verificationEmailTxt() {
  return `Hi {{ first_name }},

Please verify your email by clicking the link below:

{{ verification_url }}

This link expires in {{ expiry_hours }} hours.

If you did not create an account, ignore this email.
`;
}

function passwordResetEmailTxt() {
  return `Hi {{ first_name }},

We received a request to reset your password. Click the link below to choose a new one:

{{ reset_url }}

This link expires in {{ expiry_hours }} hour(s).

If you did not request a password reset, ignore this email. Your password will not change.
`;
}

// ── Admin ──────────────────────────────────────────────────────────────

function coreAdminPy() {
  return `from django.contrib import admin

from .models import BasePicture

# Register your core models here.
# Example:
# @admin.register(MyModel)
# class MyModelAdmin(admin.ModelAdmin):
#     list_display = ('name', 'enabled', 'created')
#     list_filter = ('enabled',)
`;
}

function usersAdminPy(includePasskey) {
  const passkeyAdmin = includePasskey
    ? `

@admin.register(PasskeyCredential)
class PasskeyCredentialAdmin(admin.ModelAdmin):
    list_display = ('user', 'name', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__email', 'name')
    readonly_fields = ('credential_id', 'sign_count', 'created_at')`
    : '';

  const passkeyImport = includePasskey ? ', PasskeyCredential' : '';

  return `from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import UserProfile${passkeyImport}


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)
${passkeyAdmin}

admin.site.unregister(User)
admin.site.register(User, UserAdmin)
`;
}

// ── Gunicorn ───────────────────────────────────────────────────────────

function gunicornConfPy() {
  return `import multiprocessing

bind = '0.0.0.0:8000'
workers = int(__import__('os').environ.get('GUNICORN_WORKERS', multiprocessing.cpu_count() * 2 + 1))
timeout = int(__import__('os').environ.get('GUNICORN_TIMEOUT', 120))
loglevel = __import__('os').environ.get('GUNICORN_LOG_LEVEL', 'warning')
accesslog = '-'
errorlog = '-'
`;
}

// ── Deployment Templates ───────────────────────────────────────────────

function dockerfile(name, moduleName) {
  return `# syntax=docker.io/docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 – Install Python dependencies.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS deps

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --upgrade pip \
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

RUN DJANGO_SETTINGS_MODULE=${moduleName}.settings \
    SECRET_KEY=build-time-secret-key \
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
ENV DJANGO_SETTINGS_MODULE=${moduleName}.settings

RUN addgroup --system --gid 1001 django && \\
    adduser --system --uid 1001 --ingroup django django && \\
    mkdir -p /app/media && chown -R django:django /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER django

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "--config", "gunicorn.conf.py", "${moduleName}.wsgi:application"]
`
    .replace(/\${moduleName}/g, moduleName)
    .replace(/\${name}/g, name);
}

function envExample(
  name,
  moduleName,
  host,
  frontendUrl,
  registryUser,
  includeRedis,
  includeEmail,
  includePasskey,
) {
  const redisVars = includeRedis
    ? `REDIS_URL=redis://redis.${name}.svc.cluster.local:6379/0
REDIS_PASSWORD=
`
    : '';

  const emailVars = includeEmail
    ? `EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_HOST=smtp.ionos.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
`
    : '';

  const passkeyVars = includePasskey
    ? `
# WebAuthn / Passkeys
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=${toTitleCase(name)}
WEBAUTHN_RP_ORIGIN=http://localhost:3000
`
    : '';

  return `# Docker / Helm
DOCKER_REGISTRY=${registryUser}
NAMESPACE=${name}

# Django
SECRET_KEY=django-insecure-change-me
DEBUG=True
ALLOWED_HOSTS=*
DJANGO_SETTINGS_MODULE=${moduleName}.settings

# CORS / CSRF
CORS_ALLOWED_ORIGINS=${frontendUrl}
CSRF_TRUSTED_ORIGINS=https://${host},${frontendUrl}
FRONTEND_URL=${frontendUrl}

# Database (leave DB_HOST empty to use SQLite locally)
DB_HOST=
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=

# Media
MEDIA_ROOT=/app/media

${redisVars}${emailVars}${passkeyVars}`;
}

// ── Helm Templates ─────────────────────────────────────────────────────

function helmChartYaml(name) {
  return `apiVersion: v2
name: ${name}
description: Helm chart for the Django ${name} application
type: application
version: 0.1.0
appVersion: '0.1.0'
`;
}

function helmValuesYaml(
  name,
  moduleName,
  host,
  frontendUrl,
  registryUser,
  includeRedis,
  includeEmail,
) {
  const redisEnv = includeRedis
    ? `  REDIS_URL: 'redis://redis.${name}.svc.cluster.local:6379/0'
`
    : '';

  const emailEnv = includeEmail
    ? `  EMAIL_HOST: 'smtp.ionos.com'
  EMAIL_PORT: '587'
  EMAIL_USE_TLS: 'True'
  EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS: '24'
`
    : '';

  const redisSecret = includeRedis
    ? `  - name: REDIS_PASSWORD
    secretName: ${name}-secrets
    secretKey: redis-password
`
    : '';

  const emailSecret = includeEmail
    ? `  - name: EMAIL_HOST_USER
    secretName: ${name}-secrets
    secretKey: email-host-user
  - name: EMAIL_HOST_PASSWORD
    secretName: ${name}-secrets
    secretKey: email-host-password
`
    : '';

  return `# ─────────────────────────────────────────────────────────────
# ${toTitleCase(name)} Application – Helm Values
# ─────────────────────────────────────────────────────────────

revisionHistoryLimit: 2
replicaCount: 1

# ─── Container image ────────────────────────────────────────
image:
  repository: ${registryUser}/${name}
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
env:
  DJANGO_SETTINGS_MODULE: '${moduleName}.settings'
  MEDIA_ROOT: '/app/media'
  DB_HOST: 'postgres.${name}.svc.cluster.local'
  DB_PORT: '5432'
  DB_NAME: 'postgres'
  DB_USER: 'postgres'
${redisEnv}${emailEnv}  FRONTEND_URL: '${frontendUrl}'
  CORS_ALLOWED_ORIGINS: '${frontendUrl}'
  DEBUG: 'False'
  ALLOWED_HOSTS: '${host},localhost,127.0.0.1'
  CSRF_TRUSTED_ORIGINS: 'https://${host}'
  GUNICORN_WORKERS: '3'

# Sensitive values – reference existing Kubernetes Secrets.
envFromSecret:
  - name: DB_PASSWORD
    secretName: ${name}-secrets
    secretKey: db-password
  - name: SECRET_KEY
    secretName: ${name}-secrets
    secretKey: secret-key
${redisSecret}${emailSecret}
# ─── Shared storage (media files via hostPath) ───────────────
sharedStorage:
  enabled: true
  hostPath: '/shared-master'
  mountPath: /app/media

# ─── Nginx sidecar (serves /media/ files) ───────────────────
nginx:
  enabled: true
  image: nginx:alpine
  port: 8080
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi

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
`
    .replace(/\${moduleName}/g, moduleName)
    .replace(/\${name}/g, name)
    .replace(/\${host}/g, host)
    .replace(/\${frontendUrl}/g, frontendUrl)
    .replace(/\${registryUser}/g, registryUser);
}

function helmHelpersTpl(name) {
  return `{{/*
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
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
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
`;
}

function helmDeploymentYaml(name) {
  return `apiVersion: apps/v1
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

          {{- if or .Values.env .Values.envFromSecret }}
          env:
            {{- range $key, $value := .Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
            {{- range .Values.envFromSecret }}
            - name: {{ .name }}
              valueFrom:
                secretKeyRef:
                  name: {{ .secretName }}
                  key: {{ .secretKey }}
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

          {{- if .Values.sharedStorage.enabled }}
          volumeMounts:
            - name: media-data
              mountPath: {{ .Values.sharedStorage.mountPath }}
          {{- end }}

        {{- if .Values.nginx.enabled }}
        - name: nginx
          image: {{ .Values.nginx.image }}
          ports:
            - name: nginx-http
              containerPort: {{ .Values.nginx.port }}
              protocol: TCP
          readinessProbe:
            httpGet:
              path: /healthz
              port: {{ .Values.nginx.port }}
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: {{ .Values.nginx.port }}
            periodSeconds: 10
            failureThreshold: 3
          {{- with .Values.nginx.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- if .Values.sharedStorage.enabled }}
          volumeMounts:
            - name: media-data
              mountPath: {{ .Values.sharedStorage.mountPath }}
            - name: nginx-config
              mountPath: /etc/nginx/conf.d
        {{- end }}
        {{- end }}

      {{- if .Values.sharedStorage.enabled }}
      volumes:
        - name: media-data
          hostPath:
            path: {{ .Values.sharedStorage.hostPath }}/{{ .Release.Namespace }}/media
            type: DirectoryOrCreate
        {{- if .Values.nginx.enabled }}
        - name: nginx-config
          configMap:
            name: {{ include "${name}.fullname" . }}-nginx
        {{- end }}
      {{- end }}
`;
}

function helmServiceYaml(name) {
  return `apiVersion: v1
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
    {{- if .Values.nginx.enabled }}
    - port: {{ .Values.nginx.port }}
      targetPort: {{ .Values.nginx.port }}
      protocol: TCP
      name: nginx-http
    {{- end }}
  selector:
    {{- include "${name}.selectorLabels" . | nindent 4 }}
`;
}

function helmIngressYaml(name) {
  return `{{- if .Values.ingress.enabled }}
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
          {{- if $.Values.nginx.enabled }}
          - path: /media
            pathType: Prefix
            backend:
              service:
                name: {{ include "${name}.fullname" $ }}
                port:
                  number: {{ $.Values.nginx.port }}
          {{- end }}
          {{- $paths := .paths | default (list (dict "path" "/" "pathType" "Prefix")) }}
          {{- range $paths }}
          - path: {{ .path }}
            pathType: {{ .pathType | default "Prefix" }}
            backend:
              service:
                name: {{ include "${name}.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
`;
}

function helmNginxConfigmap(name) {
  return `{{- if .Values.nginx.enabled }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "${name}.fullname" . }}-nginx
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
data:
  default.conf: |
    server {
        listen {{ .Values.nginx.port }};
        server_name _;

        location /media/ {
            if ($request_method !~ ^(GET|HEAD)$) {
                return 405;
            }
            alias {{ .Values.sharedStorage.mountPath }}/;
            expires 1h;
            add_header Cache-Control "public";
            sendfile on;
            tcp_nopush on;
        }

        location /healthz {
            access_log off;
            return 200 "ok\\n";
            add_header Content-Type text/plain;
        }

        location / {
            return 404;
        }
    }
{{- end }}
`;
}

function helmNotesTxt(name) {
  return `──────────────────────────────────────────────────────────────
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
`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  New Django App Scaffold\n');

  const { rl, prompt } = createPrompt();

  // App name (directory)
  let name = '';
  while (true) {
    name = await prompt('  App name (e.g., my-api)');
    const error = validateAppName(name);
    if (!error) break;
    console.log(`  Error: ${error}`);
  }

  // Django module name (Python package)
  const defaultModule = toModuleName(name);
  const moduleInput = await prompt('  Django module name', defaultModule);
  const moduleName = moduleInput || defaultModule;

  // Host
  const defaultHost = `${name}.iguzman.com.mx`;
  const host = (await prompt('  Host', defaultHost)) || defaultHost;

  // Frontend URL
  const defaultFrontend = `https://${name.replace(/-api$/, '')}.iguzman.com.mx`;
  const frontendUrl =
    (await prompt('  Frontend URL', defaultFrontend)) || defaultFrontend;

  // Redis
  const redisInput = await prompt('  Include Redis cache? [y/n]', 'y');
  const includeRedis = redisInput.toLowerCase().startsWith('y');

  // Email
  const emailInput = await prompt(
    '  Include email (signup verification + password reset)? [y/n]',
    'y',
  );
  const includeEmail = emailInput.toLowerCase().startsWith('y');

  // Passkey (requires email + redis for challenge cache)
  let includePasskey = false;
  if (includeEmail && includeRedis) {
    const passkeyInput = await prompt('  Include passkeys (WebAuthn)? [y/n]', 'y');
    includePasskey = passkeyInput.toLowerCase().startsWith('y');
  }

  // Docker registry user
  const registryUser = await prompt('  Docker registry user', 'docker');

  rl.close();

  // Build
  const appDir = join(APPS_DIR, name);
  const appPath = (rel) => join(appDir, rel);

  console.log(`\n  Creating apps/${name}...\n`);

  // Root files
  writeFile(appPath('package.json'), packageJson(name));
  writeFile(
    appPath('requirements.txt'),
    requirementsTxt(includeRedis, includeEmail, includePasskey),
  );
  writeFile(appPath('manage.py'), managePy(moduleName));
  writeFile(appPath('entrypoint.sh'), entrypointSh());
  writeFile(appPath('Dockerfile'), dockerfile(name, moduleName));
  writeFile(appPath('gunicorn.conf.py'), gunicornConfPy());
  writeFile(
    appPath('.env'),
    envExample(
      name,
      moduleName,
      host,
      frontendUrl,
      registryUser,
      includeRedis,
      includeEmail,
      includePasskey,
    ),
  );
  writeFile(
    appPath('env.example'),
    envExample(
      name,
      moduleName,
      host,
      frontendUrl,
      registryUser,
      includeRedis,
      includeEmail,
      includePasskey,
    ),
  );

  // Django project package
  writeFile(appPath(`${moduleName}/__init__.py`), initPy());
  writeFile(
    appPath(`${moduleName}/settings.py`),
    settingsPy(moduleName, host, frontendUrl, includeRedis, includeEmail, includePasskey),
  );
  writeFile(appPath(`${moduleName}/urls.py`), urlsPy(moduleName));
  writeFile(appPath(`${moduleName}/wsgi.py`), wsgiPy(moduleName));
  writeFile(appPath(`${moduleName}/asgi.py`), asgiPy(moduleName));

  // Core app
  writeFile(appPath('core/__init__.py'), initPy());
  writeFile(appPath('core/apps.py'), coreAppsPy());
  writeFile(appPath('core/admin.py'), coreAdminPy());
  writeFile(appPath('core/fields.py'), coreFieldsPy());
  writeFile(appPath('core/models.py'), coreModelsPy());
  writeFile(appPath('core/serializers.py'), coreSerializersPy());
  writeFile(appPath('core/migrations/__init__.py'), initPy());

  // Users app
  writeFile(appPath('users/__init__.py'), initPy());
  writeFile(appPath('users/apps.py'), usersAppsPy());
  writeFile(appPath('users/admin.py'), usersAdminPy(includePasskey));
  writeFile(appPath('users/models.py'), usersModelsPy(includeEmail, includePasskey));
  writeFile(appPath('users/signals.py'), usersSignalsPy());
  writeFile(appPath('users/serializers.py'), usersSerializersPy(includeEmail, includePasskey));
  writeFile(appPath('users/views.py'), usersViewsPy(includeEmail, includePasskey));
  writeFile(appPath('users/urls.py'), usersUrlsPy(includeEmail, includePasskey));
  writeFile(appPath('users/migrations/__init__.py'), initPy());
  writeFile(appPath('users/migrations/0001_initial.py'), migration0001());

  if (includeEmail) {
    writeFile(
      appPath('users/migrations/0002_emailverificationtoken.py'),
      migration0002Email(),
    );
    writeFile(
      appPath('users/migrations/0003_passwordresettoken.py'),
      migration0003PasswordReset(),
    );
    writeFile(
      appPath('users/templates/users/verification_email.txt'),
      verificationEmailTxt(),
    );
    writeFile(
      appPath('users/templates/users/password_reset_email.txt'),
      passwordResetEmailTxt(),
    );
  }

  if (includePasskey) {
    writeFile(
      appPath('users/migrations/0004_passkeycredential.py'),
      migration0004Passkey(),
    );
  }

  // Create empty media + staticfiles directories
  mkdirSync(appPath('media'), { recursive: true });
  mkdirSync(appPath('staticfiles'), { recursive: true });

  // Helm chart
  writeFile(appPath('helm/Chart.yaml'), helmChartYaml(name));
  writeFile(
    appPath('helm/values.yaml'),
    helmValuesYaml(
      name,
      moduleName,
      host,
      frontendUrl,
      registryUser,
      includeRedis,
      includeEmail,
    ),
  );
  writeFile(appPath('helm/templates/_helpers.tpl'), helmHelpersTpl(name));
  writeFile(
    appPath('helm/templates/deployment.yaml'),
    helmDeploymentYaml(name),
  );
  writeFile(appPath('helm/templates/service.yaml'), helmServiceYaml(name));
  writeFile(appPath('helm/templates/ingress.yaml'), helmIngressYaml(name));
  writeFile(
    appPath('helm/templates/nginx-configmap.yaml'),
    helmNginxConfigmap(name),
  );
  writeFile(appPath('helm/templates/NOTES.txt'), helmNotesTxt(name));

  console.log(`  Done! Created apps/${name} with the following setup:`);
  console.log(`    Module:   ${moduleName}`);
  console.log(`    Host:     ${host}`);
  console.log(`    Frontend: ${frontendUrl}`);
  console.log(`    Redis:    ${includeRedis ? 'yes' : 'no'}`);
  console.log(`    Email:    ${includeEmail ? 'yes' : 'no'}`);
  console.log(`    Passkeys: ${includePasskey ? 'yes (WebAuthn)' : 'no'}`);
  console.log(`    Registry: ${registryUser}/${name}`);
  console.log('');
  console.log('  Next steps:');
  console.log(`    1. cd apps/${name}`);
  console.log('    2. python3 -m venv venv && source venv/bin/activate');
  console.log('    3. pip install -r requirements.txt');
  console.log('    4. python3 manage.py migrate');
  console.log('    5. python3 manage.py createsuperuser');
  console.log('    6. python3 manage.py runserver');
  console.log(`    7. cp apps/${name}/env.example apps/${name}/.env`);
  console.log('    8. Update .env with your secrets before deploying');
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
