helm install nginx-plant deployment/nginx \
  --namespace=plant \
  --set webAppName=plant \
  --set volumeMountPath=shared-volume