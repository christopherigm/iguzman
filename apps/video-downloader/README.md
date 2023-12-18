Deploy Nginx server

```sh
helm install nginx-api deployment/nginx \
  --namespace=video-downloader \
  --set apiName=video-downloader-api \
  --set volumeMountPath=shared-volume
```

Uninstall and install Nginx

```sh
helm uninstall nginx-api -n video-downloader && \
helm install nginx-api deployment/nginx \
  --namespace=video-downloader \
  --set apiName=video-downloader-api \
  --set volumeMountPath=shared-volume
```

Build app and deploy Microservice

```sh
npm run deploy
```

Deploy Microservice only (Skip build)

```sh
npm run deploy-only
```
