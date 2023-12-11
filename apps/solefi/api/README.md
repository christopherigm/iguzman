# BACK

## Linux instructions

Linux does not need instructions ;)

## Windows instructions

### Install Python

Get it form [here](https://www.python.org/downloads/)

### Download and install PIP

Get it form [here](https://bootstrap.pypa.io/get-pip.py)

Open a GitBash terminal as administrator and do:

```sh
python get-pip.py
```

Install virtualenvwrapper, virtualenv and supertools

```sh
python -m pip install virtualenv virtualenvwrapper supertools
```

### Create virtualenv

```sh
virtualenv.exe my_venv
```

This command will create a folder `venv` with the virtualenv inside of it.

To activate the virtualenv just do

```sh
source ./my_venv/Scripts/activate
```

To deactivate:

```sh
deactivate
```

### Backup database

```sh
kubectl exec -it <POD> \
/usr/local/bin/pg_dump solefi -U solefi > solefi.bak
```

### Restore database

```sh
kubectl cp solefi.bak <POD>:/ -n solefi
kubectl exec -it <POD> -n solefi -- /bin/sh
psql solefi -U solefi < /solefi.bak
```

### Production deployment

1. Build and publish Docker image

```sh
docker build -t solefi-api:latest . && \
docker tag solefi-api:latest christopherguzman/solefi-api:latest && \
docker push christopherguzman/solefi-api:latest
```

2. Create namespace

```sh
kubectl create namespace solefi
```

3. Deploy Postgres

```sh
helm install postgres-api deployment/postgres \
  --namespace=solefi \
  --set config.POSTGRES_DB=solefi \
  --set config.POSTGRES_USER=solefi \
  --set config.POSTGRES_PASSWORD=solefi
```

Uninstall postgress

```sh
helm delete postgres-api -n solefi
```

4. Deploy Nginx server

```sh
helm install nginx-api deployment/nginx \
  --namespace=solefi \
  --set apiName=solefi-api \
  --set volumeMountPath=shared-volume
```

Uninstall Nginx

```sh
helm delete nginx-api -n solefi
```

5. Deploy microservice
   cd

```sh
helm install solefi-api deployment \
  --namespace=solefi \
  --set config.ENVIRONMENT=master \
  --set config.SECRET_KEY=123456431 \
  --set config.DB_HOST=postgres-api.solefi.svc.cluster.local \
  --set config.DB_NAME=solefi \
  --set config.DB_USER=solefi \
  --set config.DB_PASSWORD=solefi \
  --set ingress.enabled=true \
  --set ingress.host=api.solefi.com.mx
```

6. Delete deployments

```sh
helm delete nginx-api -n solefi && \
helm delete postgres-api -n solefi && \
helm delete solefi-api -n solefi
```
