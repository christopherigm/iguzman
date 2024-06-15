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

0. Patch Microk8s Nginx Ingress controller
   to set `proxy-body-size: 60m`
   https://github.com/canonical/microk8s/issues/1539

```sh
kubectl -n ingress patch configmap nginx-load-balancer-microk8s-conf --patch "$(cat ./deployment/nginx/nginx-config-map-patch.yaml)"
```

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

Deploy Mongo

```sh
helm install mongo-api deployment/mongo -n video-downloader
```

Uninstall Mongo

```sh
helm delete mongo-api -n video-downloader
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

# https://github.com/yt-dlp/yt-dlp

# Music from youtube

Get video info

```sh
./yt-dlp-win.exe https://youtu.be/k1UCqCuGdck \
 --print "%(channel)s - %(duration>%H:%M:%S)s - %(title)s - %(purl)s"
```

Get video title

```sh
./yt-dlp-win.exe https://youtu.be/k1UCqCuGdck --print "%(title)s"
```

Get video formats

```sh
./yt-dlp https://youtu.be/k1UCqCuGdck --list-formats

./yt-dlp-win.exe https://www.instagram.com/reel/C1n1kxFrLvT/ --list-formats
./yt-dlp-win.exe https://youtu.be/k1UCqCuGdck --list-formats
```

Get video and convert it into mov

```sh
rm -rf media/* && rm -rf public/media/* && \
./yt-dlp-win.exe "https://youtube.com/shorts/l48BW7BKcBU?si=lEdKGj2Tp5FEK_nI" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio" --remux-video mov --merge-output-format mov --postprocessor-args "-acodec aac -vcodec libx264" -o "media/659854d84d68229396c95e7c.%(ext)s"
```

./yt-dlp https://www.youtube.com/watch?v=1Tgu8aK0omo \
 -f 'bestaudio[ext=webm]/bestaudio' \
 -o "%(artist)s - %(title)s.mp3"

./yt-dlp https://youtu.be/k1UCqCuGdck \
 -f 'bestaudio[ext=webm]/bestaudio' \
 -o "%(artist)s - %(title)s.mp3" \
 --cookies /home/christopher/Downloads/cookies.txt

# Youtube

./yt-dlp https://youtu.be/d8OI9FllKfg \
 -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio' \
 --merge-output-format mp4 \
 -o "%(title)s.%(ext)s"

# Tiktok

./yt-dlp https://www.tiktok.com/@wtfmoms/video/7292314796681186593 \
--add-header 'user-agent:Mozilla/5.0' -vU \
 -o "videos.%(ext)s

# Instagram

./yt-dlp https://www.instagram.com/reel/CzG-g_EuLJG \
--add-header 'user-agent:Mozilla/5.0' -vU \
 -o "%(title)s.%(ext)s"

# Twitter

./yt-dlp-win.exe https://x.com/FadeHubb/status/1731362761773318168?s=20 \
--add-header 'user-agent:Mozilla/5.0' -vU \
-o "%(title)s.%(ext)s"

# Facebook

./yt-dlp https://www.facebook.com/reel/881654479807536/ \
--add-header 'user-agent:Mozilla/5.0' -vU \
 -o "video.%(ext)s"

./yt-dlp https://youtu.be/9IQP6otIvh --list-formats

scp christopher@surface:/home/christopher/Videos/video.mp4 .
scp christopher@raspberrypi:/home/christopher/video.mp4 .

./yt-dlp https://youtu.be/DrKA7sKOhws \
 -f 'bestaudio[ext=m4a]/bestaudio' \
 --parse-metadata "title:%(artist)s - %(title)s" \
 -o "audio.%(ext)s"
