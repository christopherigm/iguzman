#!/bin/bash

echo "ENVIRONMENT: $ENVIRONMENT"

# Collect static files
echo "Collect static files"
python3 manage.py collectstatic --noinput

# Apply database migrations
echo "Apply database migrations"
python3 manage.py migrate

# Start server
echo "Starting server"
gunicorn --bind 0.0.0.0:8000 --workers 1 --reload solefi_cms.wsgi:application
