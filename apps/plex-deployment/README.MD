## Deploy Nginx proxy

Create namespace

```sh
kubectl create namespace plex
```

```sh
helm install plex-nginx-proxy deployment \
  --namespace=plex \
  --set ingress.host=media.iguzman.com.mx \
  --set service.serverIP=192.168.0.21 \
  --set service.serverPort=32400
```

Delete deployment

```sh
helm delete plex-nginx-proxy -n plex
```
