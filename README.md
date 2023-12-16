# Start new Next JS App

If the new Next JS app name is "my-new-app", the values for it would be something like these:

```sh
npm run create-next-app \
  appName=my-new-app \
  namespace=my-new-app \
  registry=christopherguzman \
  repository=my-new-app \
  host=my-new-app.iguzman.com.mx \
  apiHost=api.my-new-app.iguzman.com.mx
```

Values a little bit more real would be the following:

```sh
npm run create-next-app \
  appName=video-downloader \
  namespace=video-downloader \
  registry=christopherguzman \
  repository=video-downloader \
  host=vd.iguzman.com.mx \
  apiHost=api.vd.iguzman.com.mx
```

## Packages

Production dependencies

```sh
npm i next react react-dom @fontsource/roboto
```

Developer dependencies

```sh
npm i @babel/core \
  @emotion/react @emotion/styled \
  @mui/icons-material @mui/material \
  @types/node @types/react @types/react-dom \
  eslint jose prettier sass \
  turbo typescript --save-dev
```
