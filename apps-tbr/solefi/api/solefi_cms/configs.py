import os
from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent

environment = environ.Env(
    SECRET_KEY=(str, 'key'),
    ENVIRONMENT=(str, 'localhost'),
    DB_HOST=(str, 'postgres-api.solefi.svc.cluster.local'),
    DB_NAME=(str, 'nedii'),
    DB_USER=(str, 'nedii'),
    DB_PASSWORD=(str, 'nedii'),
    EMAIL_HOST_USER=(str, 'john@doe.com'),
    EMAIL_HOST_PASSWORD=(str, 'password')
)

SERVER_APP_FOLDER_NAME = 'solefi-cms'

environ.Env.read_env()

SECRET_KEY = environment('SECRET_KEY')
ENVIRONMENT=environment('ENVIRONMENT')
DB_HOST=environment('DB_HOST')
DB_NAME=environment('DB_NAME')
DB_USER=environment('DB_USER')
DB_PASSWORD=environment('DB_PASSWORD')
EMAIL_HOST_USER = environment('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = environment('EMAIL_HOST_PASSWORD')


class Common:
    SECRET_KEY = SECRET_KEY
    SITE_HEADER = 'Solefi'
    INDEX_TITLE = 'CMS'
    SITE_TITLE = 'CMS'
    API_DNS = 'http://127.0.0.1:8000/'
    API_URL = '{}v1/'.format(API_DNS)
    EMAIL_HOST = 'smtp.gmail.com'
    EMAIL_USE_TLS = True
    EMAIL_PORT = 587
    DEBUG = True
    ALLOWED_HOSTS = ['*']
    JWT_ACCESS_EXPIRATION_DAYS=360
    JWT_REFRESH_EXPIRATION_DAYS=360
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql_psycopg2',
            'NAME': DB_NAME,
            'USER': DB_USER,
            'PASSWORD': DB_PASSWORD,
            'HOST': DB_HOST,
            'PORT': '5432'
        }
    }
    EMAIL_HOST_USER = EMAIL_HOST_USER
    EMAIL_HOST_PASSWORD = EMAIL_HOST_PASSWORD
    ENVIRONMENT=ENVIRONMENT
    MEDIA_ROOT='/media'
    STATIC_ROOT='/static'
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')


class LOCAL(Common):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.path.join(BASE_DIR, 'db.sqlite3')
        }
    }
    WEB_APP_URL='http://127.0.0.1:3000/'
    API_URL='http://127.0.0.1:8000/'
    MEDIA_ROOT=os.path.join(BASE_DIR, 'media')
    STATIC_ROOT = os.path.join(BASE_DIR, "static")
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'http')


class STAGING(Common):
    WEB_APP_URL='https://solefi.vaggustudios.com.mx/'
    API_URL='https://api.solefi.vaggustudios.com.mx/'


class MASTER(Common):
    DEBUG=False
    JWT_ACCESS_EXPIRATION_DAYS=30
    JWT_REFRESH_EXPIRATION_DAYS=360
    OP_VERIFY_SSL_CERTS=True
    OP_PRODUCTION=True
    WEB_APP_URL='https://www.solefi.com.mx/'
    API_URL='https://api.solefi.com.mx/'


if ENVIRONMENT == 'staging':
    env = STAGING
elif ENVIRONMENT == 'master':
    env = MASTER
else:
    env = LOCAL
