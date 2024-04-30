#! /bin/bash

echo "Enter app name (users):"
read app
if [ ! -n "$app" ]
then
    exit 1;
fi

python3 manage.py startapp $app
