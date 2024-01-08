#### https://levelup.gitconnected.com/how-to-install-wordpress-on-kubernetes-a-step-by-step-guide-93460c512943

0. Patch Microk8s Nginx Ingress controller
   to set `proxy-body-size: 60m`
   https://github.com/canonical/microk8s/issues/1539

```
kubectl -n ingress edit cm nginx-load-balancer-microk8s-conf
```

Add:

```
data:
  proxy-body-size: 80m
```

1. Create namespace

```sh
kubectl create namespace blog
```

2. Deploy MySQL

```sh
helm install mysql deployment/my-sql \
  --namespace=blog \
  --set config.MYSQL_DATABASE=blog \
  --set config.MYSQL_ROOT_PASSWORD=blog
```

Remove MySQL Deployment

```sh
helm uninstall mysql --namespace=blog
```

Reinstall MySQL Deployment

```sh
helm uninstall mysql --namespace=blog && \
helm install mysql deployment/my-sql \
  --namespace=blog \
  --set config.MYSQL_DATABASE=blog \
  --set config.MYSQL_ROOT_PASSWORD=blog
```

```sh
helm upgrade mysql deployment/my-sql \
  --namespace=blog \
  --set config.MYSQL_DATABASE=blog \
  --set config.MYSQL_ROOT_PASSWORD=blog
```

Install Blog

```sh
helm install blog deployment \
 --namespace=blog \
 --set config.WORDPRESS_DB_HOST=mysql.blog.svc.cluster.local \
 --set config.WORDPRESS_DB_NAME=blog \
 --set config.WORDPRESS_DB_USER=root \
 --set config.WORDPRESS_DB_PASSWORD=blog
```

Uninstall Blog

```sh
helm uninstall blog --namespace=blog
```

Uninstall and Install Blog

```sh
helm uninstall blog --namespace=blog && \
helm install blog deployment \
 --namespace=blog \
 --set config.WORDPRESS_DB_HOST=mysql.blog.svc.cluster.local \
 --set config.WORDPRESS_DB_NAME=blog \
 --set config.WORDPRESS_DB_USER=root \
 --set config.WORDPRESS_DB_PASSWORD=blog
```

Upgrade Blog

```sh
helm upgrade blog deployment \
 --namespace=blog \
 --set config.WORDPRESS_DB_HOST=mysql.blog.svc.cluster.local \
 --set config.WORDPRESS_DB_NAME=blog \
 --set config.WORDPRESS_DB_USER=root \
 --set config.WORDPRESS_DB_PASSWORD=blog
```

https://techoverflow.net/2022/05/12/how-to-fix-wordpress-docker-image-upload-size-2m-limit/

https://medium.com/@nnilesh7756/copy-directories-and-files-to-and-from-kubernetes-container-pod-19612fa74660

kubectl -n blog cp .htaccess blog-5cdf4c675c-nlpgr:/var/www/html