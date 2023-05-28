# Plant API

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

### Create virtualenv

```sh
python -m venv venv
```

This command will create a folder `venv` with the virtualenv inside of it.

To activate the virtualenv just do

```sh
source venv/bin/activate
```

To deactivate:

```sh
deactivate
```

### Backup database
```sh
kubectl exec -it <POD> \
/usr/local/bin/pg_dump plant-api -U plant-api > plant-api.bak
```

### Restore database
```sh
kubectl cp plant-api.bak <POD>:/ -n plant
kubectl exec -it <POD> -n plant -- /bin/sh
psql plant-api -U plant-api < /plant-api.bak
```

### Production deployment

1) Build and publish Docker image
```sh
docker build -t plant-api:latest . && \
docker tag plant-api:latest christopherguzman/plant-api:latest && \
docker push christopherguzman/plant-api:latest
```

2) Create namespace
`kubectl create namespace plant`

3) Deploy Postgres
```sh
helm install postgres-api deployment/postgres \
  --namespace=plant \
  --set config.POSTGRES_DB=plant-api \
  --set config.POSTGRES_USER=plant-api \
  --set config.POSTGRES_PASSWORD=plant-api
```

4) Deploy Nginx server
```sh
helm install nginx-api deployment/nginx \
  --namespace=plant \
  --set apiName=plant-api \
  --set volumeMountPath=shared-volume
```

5) Deploy microservice
```sh
helm install plant-api deployment \
  --namespace=plant \
  --set config.SECRET_KEY=123456 \
  --set config.ENVIRONMENT=production \
  --set config.BRANCH=main \
  --set config.DB_HOST=postgres-api.plant.svc.cluster.local \
  --set config.DB_NAME=plant-api \
  --set config.DB_USER=plant-api \
  --set config.DB_PASSWORD=plant-api \
  --set config.EMAIL_HOST_USER=email@gmail.com \
  --set config.EMAIL_HOST_PASSWORD=password \
  --set config.API_URL="https://api.resume.iguzman.com.mx" \
  --set config.WEB_APP_URL="https://resume.iguzman.com.mx" \
  --set ingress.enabled=true \
  --set ingress.host=api.resume.iguzman.com.mx
```

6) Delete deployments
```sh
helm delete nginx-api -n plant && \
helm delete postgres-api -n plant && \
helm delete plant-api -n plant
```

7) Automated NodeJS deployment

Regular deployment
```sh
npm run deploy
```

Regular deployment + fixtures
```sh
export RUN_FIXTURES=true && \
npm run deploy
```


## Update Python packages
```sh
python3 -m pip install \
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
uritemplate urllib3 python-environ
```

Update requirements text file
```sh
npm run freeze
```
