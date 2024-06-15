import os
from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent

environment = environ.Env(
    HOSTNAME=(str, 'localhost'),
    VERSION=(str, '0.0.1'),
    SECRET_KEY=(str, 'key'),
    ENVIRONMENT=(str, 'local'),
    BRANCH=(str, 'main'),
    DB_HOST=(str, 'postgres-api.nedii.svc.cluster.local'),
    DB_NAME=(str, 'DB_NAME'),
    DB_USER=(str, 'DB_USER'),
    DB_PASSWORD=(str, 'DB_PASSWORD'),
    EMAIL_HOST_USER=(str, 'EMAIL_HOST_USER'),
    EMAIL_HOST_PASSWORD=(str, 'EMAIL_HOST_PASSWORD'),
    EMAIL_TEMPLATE_COMPANY_NAME=(str, 'EMAIL_TEMPLATE_COMPANY_NAME'),
    EMAIL_TEMPLATE_COMPANY_LOGO=(str, 'EMAIL_TEMPLATE_COMPANY_LOGO'),
    JWT_ACCESS_EXPIRATION_DAYS=(str, 'JWT_ACCESS_EXPIRATION_DAYS'),
    JWT_REFRESH_EXPIRATION_DAYS=(str, 'JWT_REFRESH_EXPIRATION_DAYS'),
    API_URL=(str, 'http://127.0.0.1:8000/v1/'),
    WEB_APP_URL=(str, 'http://127.0.0.1:3000/'),
)

environ.Env.read_env()

HOSTNAME = environment('HOSTNAME')
VERSION = environment('VERSION')
SECRET_KEY = environment('SECRET_KEY')
ENVIRONMENT = environment('ENVIRONMENT')
BRANCH = environment('BRANCH')
DB_HOST = environment('DB_HOST')
DB_NAME = environment('DB_NAME')
DB_USER = environment('DB_USER')
DB_PASSWORD = environment('DB_PASSWORD')
EMAIL_HOST_USER = environment('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = environment('EMAIL_HOST_PASSWORD')
EMAIL_TEMPLATE_COMPANY_NAME = environment('EMAIL_TEMPLATE_COMPANY_NAME')
EMAIL_TEMPLATE_COMPANY_LOGO = environment('EMAIL_TEMPLATE_COMPANY_LOGO')
JWT_ACCESS_EXPIRATION_DAYS = environment('JWT_ACCESS_EXPIRATION_DAYS')
JWT_REFRESH_EXPIRATION_DAYS = environment('JWT_REFRESH_EXPIRATION_DAYS')
API_URL = environment('API_URL')
WEB_APP_URL = environment('WEB_APP_URL')


class Production:
    SITE_HEADER = '{0} API CMS'.format(EMAIL_TEMPLATE_COMPANY_NAME)
    INDEX_TITLE = 'CMS'
    SITE_TITLE = 'CMS'
    EMAIL_HOST = 'smtp.gmail.com'
    EMAIL_USE_TLS = True
    EMAIL_PORT = 587
    DEBUG = False
    ALLOWED_HOSTS = ['*']
    JWT_ACCESS_EXPIRATION_DAYS = 360
    JWT_REFRESH_EXPIRATION_DAYS = 360
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
    MEDIA_ROOT = '/media'
    STATIC_ROOT = '/static'
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    HOSTNAME = HOSTNAME
    VERSION = VERSION
    SECRET_KEY = SECRET_KEY
    ENVIRONMENT = ENVIRONMENT
    BRANCH = BRANCH
    EMAIL_HOST_USER = EMAIL_HOST_USER
    EMAIL_HOST_PASSWORD = EMAIL_HOST_PASSWORD
    EMAIL_TEMPLATE_COMPANY_NAME = EMAIL_TEMPLATE_COMPANY_NAME
    EMAIL_TEMPLATE_COMPANY_LOGO = EMAIL_TEMPLATE_COMPANY_LOGO
    JWT_ACCESS_EXPIRATION_DAYS = JWT_ACCESS_EXPIRATION_DAYS
    JWT_REFRESH_EXPIRATION_DAYS = JWT_REFRESH_EXPIRATION_DAYS
    API_URL = API_URL
    WEB_APP_URL = WEB_APP_URL


class LOCAL(Production):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.path.join(BASE_DIR, 'db.sqlite3')
        }
    }
    MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
    STATIC_ROOT = os.path.join(BASE_DIR, "static")
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'http')
    DEBUG = True


env = Production

if ENVIRONMENT != 'production':
    env = LOCAL
