#!/bin/bash

echo "RUN_FIXTURES: $RUN_FIXTURES"

if [ "$RUN_FIXTURES" = "true" ]
then
  python3 manage.py loaddata \
    system \
    skill-categories \
    9000-skills-backend \
    9100-skills-frontend \
    9200-skills-languages \
    9300-skills-mobile \
    9400-skills-data-bases \
    9500-skills-ci-cd \
    9600-skills-platforms \
    9700-skills-iot \
    schools \
    companies \
    countries \
    states \
    cities \
    user \
    user-schools \
    user-jobs \
    user-skills
fi

# Collect static files
echo "Collect static files"
python3 manage.py collectstatic --noinput

# Apply database migrations
echo "Apply database migrations"
python3 manage.py migrate

cp -r resume/fixtures/assets/companies/ /media/
cp -r resume/fixtures/assets/schools/ /media/
cp -r resume/fixtures/assets/skills/ /media/
cp -r resume/fixtures/assets/user/ /media/
cp -r common/fixtures/assets/system/ /media/

# Start server
echo "Starting server"
gunicorn --bind 0.0.0.0:8000 --workers 1 --reload my_cv_api.wsgi:application
