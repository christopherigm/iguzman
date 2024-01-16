# Local dev

## Run

go run main.go

## Build

go build -o app

or

go build -o app.exe

## Run built

./app

# K8s deployment

docker build -t basic-go-rest-api .

docker tag basic-go-rest-api christopherguzman/basic-go-rest-api:latest

docker push christopherguzman/basic-go-rest-api:latest

kubectl create namespace golang

helm delete basic-go-rest-api -n golang

helm install basic-go-rest-api deployment \
 --namespace=golang \
 --set image.tag=latest

helm -n golang ls

kubectl -n golang get pod

https://basic-go-rest-api.iguzman.com.mx/todos
