#!/bin/sh
set -e

# Only the web process runs migrations; the Celery worker skips this.
if [ "$1" = "gunicorn" ]; then
    python manage.py migrate --noinput
    python manage.py collectstatic --noinput
fi

exec "$@"
