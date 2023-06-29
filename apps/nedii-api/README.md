# Nedii API

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
/usr/local/bin/pg_dump nedii-api -U nedii-api > nedii-api.bak
```

### Restore database
```sh
kubectl cp nedii-api.bak <POD>:/ -n nedii
kubectl exec -it <POD> -n nedii -- /bin/sh
psql nedii-api -U nedii-api < /nedii-api.bak
```

### Production deployment

0) Patch Microk8s Nginx Ingress controller 
to set `proxy-body-size: 60m`
https://github.com/canonical/microk8s/issues/1539

```sh
kubectl -n ingress patch configmap nginx-load-balancer-microk8s-conf --patch "$(cat ./deployment/nginx/nginx-config-map-patch.yaml)"
```

1) Build and publish Docker image
```sh
docker build -t nedii-api:latest . && \
docker tag nedii-api:latest christopherguzman/nedii-api:latest && \
docker push christopherguzman/nedii-api:latest
```

2) Create namespace
`kubectl create namespace nedii`

3) Deploy Postgres
```sh
helm install postgres-api deployment/postgres \
  --namespace=nedii \
  --set config.POSTGRES_DB=nedii-api \
  --set config.POSTGRES_USER=nedii-api \
  --set config.POSTGRES_PASSWORD=nedii-api
```

4) Deploy Nginx server
```sh
helm install nginx-api deployment/nginx \
  --namespace=nedii \
  --set apiName=nedii-api \
  --set volumeMountPath=shared-volume
```

5) Deploy microservice
```sh
helm install nedii-api deployment \
  --namespace=nedii \
  --set config.SECRET_KEY=123456 \
  --set config.ENVIRONMENT=production \
  --set config.BRANCH=main \
  --set config.DB_HOST=postgres-api.nedii.svc.cluster.local \
  --set config.DB_NAME=nedii-api \
  --set config.DB_USER=nedii-api \
  --set config.DB_PASSWORD=nedii-api \
  --set config.EMAIL_HOST_USER=email@gmail.com \
  --set config.EMAIL_HOST_PASSWORD=password \
  --set config.API_URL="https://api.nedii.iguzman.com.mx" \
  --set config.WEB_APP_URL="https://nedii.iguzman.com.mx" \
  --set ingress.enabled=true \
  --set ingress.host=api.nedii.iguzman.com.mx
```

6) Delete deployments
```sh
helm delete nginx-api -n nedii && \
helm delete postgres-api -n nedii && \
helm delete nedii-api -n nedii
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
