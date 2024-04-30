#! /bin/bash

echo "Enter environment (staging):"
read env
if [ ! -n "$env" ]
then
    exit 1;
fi

echo "Enter DB name (db_name):"
read db_name
if [ ! -n "$db_name" ]
then
    exit 1;
fi

echo "Enter DB User (db_user):"
read db_user
if [ ! -n "$db_user" ]
then
    exit 1;
fi

echo "Enter DB Password (db_password):"
read db_password
if [ ! -n "$db_password" ]
then
    exit 1;
fi

export env=$env &&\
export db_name=$db_name &&\
export db_user=$db_user &&\
export db_password=$db_password &&\
python3 manage.py createsuperuser
