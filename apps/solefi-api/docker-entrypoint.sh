#!/bin/bash

echo "RUN_FIXTURES: $RUN_FIXTURES"

# if [ "$RUN_FIXTURES" = "true" ]
# then
# fi


# Collect static files
echo "Collect static files"
python3 manage.py collectstatic --noinput

# Apply database migrations
echo "Apply database migrations"
python3 manage.py migrate

# Start server
echo "Starting server"
gunicorn --bind 0.0.0.0:8000 --workers 1 --reload nedii_api.wsgi:application
