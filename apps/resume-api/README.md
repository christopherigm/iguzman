# Resume API

## Linux instructions

```sh
sudo apt install libpq-dev python3-dev python3.10-venv build-essential python-setuptools python3-distutils
sudo apt install postgresql-server-dev-all
```

## Windows instructions

### Install Python

Get it form [here](https://www.python.org/downloads/)

### Download and install PIP

Get it form [here](https://bootstrap.pypa.io/get-pip.py)

Open a GitBash terminal as administrator and do:

```sh
python3 get-pip.py
```

Install virtualenvwrapper, virtualenv and

```sh
python3 -m pip install virtualenv virtualenvwrapper
```

### For windows

Install MS Build Tools

Install Desktop development with C++ (from Visual Studio Installer)

Install Postgre SQL (port 5432)

Install: python -m pip install psycopg2-binary

### Create virtualenv

```sh
python -m venv venv
```

This command will create a folder `venv` with the virtualenv inside of it.

To activate the virtualenv just do

```sh
source venv/Scripts/activate
```

To deactivate:

```sh
deactivate
```

### Backup database

```sh
kubectl exec -it <POD> \
/usr/local/bin/pg_dump my-cv-api -U my-cv-api > my-cv-api.bak
```

### Restore database

```sh
kubectl cp my-cv-api.bak <POD>:/ -n my-cv-api
kubectl exec -it <POD> -n my-cv-api -- /bin/sh
psql my-cv-api -U my-cv-api < /my-cv-api.bak
```

### Production deployment

1. Build and publish Docker image

```sh
docker build -t my-cv-api:latest . && \
docker tag my-cv-api:latest christopherguzman/my-cv-api:latest && \
docker push christopherguzman/my-cv-api:latest
```

2. Create namespace

```sh
kubectl create namespace my-cv
```

3. Deploy Postgres

```sh
helm install postgres-api deployment/postgres \
  --namespace=my-cv \
  --set config.POSTGRES_DB=my-cv-api \
  --set config.POSTGRES_USER=my-cv-api \
  --set config.POSTGRES_PASSWORD=my-cv-api
```

4. Deploy Nginx server

```sh
helm install nginx-api deployment/nginx \
  --namespace=my-cv \
  --set apiName=my-cv-api \
  --set volumeMountPath=shared-volume
```

5. Deploy microservice

```sh
helm install my-cv-api deployment \
  --namespace=my-cv \
  --set config.SECRET_KEY=123aaa456 \
  --set config.ENVIRONMENT=production \
  --set config.BRANCH=main \
  --set config.DB_HOST=postgres-api.my-cv.svc.cluster.local \
  --set config.DB_NAME=my-cv-api \
  --set config.DB_USER=my-cv-api \
  --set config.DB_PASSWORD=my-cv-api \
  --set config.EMAIL_HOST_USER=email@gmail.com \
  --set config.EMAIL_HOST_PASSWORD=password \
  --set config.API_URL="https://api.resume.iguzman.com.mx" \
  --set config.WEB_APP_URL="https://resume.iguzman.com.mx" \
  --set ingress.enabled=true \
  --set ingress.host=api.resume.iguzman.com.mx
```

6. Delete deployments

```sh
helm delete nginx-api -n my-cv && \
helm delete postgres-api -n my-cv && \
helm delete my-cv-api -n my-cv
```

7. Automated NodeJS deployment

Regular deployment

```sh
export DB_HOST=postgres-api.my-cv.svc.cluster.local && \
export DB_NAME=my-cv-api && \
export DB_USER=my-cv-api && \
export DB_PASSWORD=my-cv-api && \
export EMAIL_HOST_USER=email@gmail.com && \
export EMAIL_HOST_PASSWORD=password && \
npm run deploy
```

Regular deployment + fixtures

```sh
export DB_HOST=postgres-api.my-cv.svc.cluster.local && \
export DB_NAME=my-cv-api && \
export DB_USER=my-cv-api && \
export DB_PASSWORD=my-cv-api && \
export EMAIL_HOST_USER=email@gmail.com && \
export EMAIL_HOST_PASSWORD=password && \
export RUN_FIXTURES=true && \
npm run deploy
```

## Update Python packages

```sh
python -m pip install \
asgiref bcrypt certifi cffi charset-normalizer \
coreapi coreschema Django django-3-jet \
django-colorfield django-cors-headers \
django-environ django-filter django-resized \
django-tinymce django-tinymce4-lite \
djangorestframework djangorestframework-jsonapi \
djangorestframework-simplejwt drf-yasg environ \
gunicorn idna inflection itypes Jinja2 jsmin \
MarkupSafe packaging Pillow psycopg2 pycparser \
pyenchant PyJWT pyparsing pytz requests \
ruamel.yaml ruamel.yaml.clib six sqlparse \
uritemplate urllib3
```

Update requirements text file

```sh
npm run freeze
```
