# App creation

First, run npm init to create a package.json file

```sh
npm init
```

In the root directory (./video-downloader) create and edit a tsconfig.json file

```sh
code tsconfig.json
```

Paste the following code:

```sh
{
  "compilerOptions": {
    "module": "commonjs",
    "esModuleInterop": true,
    "target": "es6",
    "moduleResolution": "node",
    "sourceMap": true,
    "outDir": "dist"
  },
  "lib": ["es2015"]
}
```

Install Typescript

```sh
npm install --save-dev typescript
```

For express applications, install the express package

```sh
npm install --save express
npm install -save-dev @types/express
```

Create a src dir

```sh
mkdir src
```

Create an app.ts file in src folder

```sh
code src/app.ts
```

# Deployment

Create namespace

```sh
kubectl create namespace video-downloader
```

Deploy Nginx server

```sh
helm install nginx-api deployment/nginx \
  --namespace=video-downloader \
  --set apiName=video-downloader-api \
  --set volumeMountPath=shared-volume
```

Uninstall Nginx

```sh
helm delete nginx-api -n video-downloader
```

Deploy app

```sh
helm install video-downloader-api deployment \
  --namespace=video-downloader \
  --set volumeMountPath=shared-volume
```

Uninstall App

```sh
helm uninstall video-downloader-api -n video-downloader
```
