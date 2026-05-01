# video-downloader

A Next.js PWA for downloading and client-side processing of videos. Uses FFmpeg compiled to WebAssembly to run entirely in the browser — no server-side video processing required.

## Features

- Download videos via yt-dlp and gallery-dl
- Client-side FFmpeg processing: black bar removal, FPS interpolation, H.264 conversion
- Server offloading: route FFmpeg jobs to a connected `server-video-editor` agent over WebSockets
- Multi-locale UI (en, es, de, fr, pt)
- Media served by an nginx sidecar for high-performance large-file delivery

---

## Development

### Prerequisites

- Node.js >= 18
- pnpm (enabled via corepack: `corepack enable pnpm`)

### Start the dev server

From the **repo root**:

```bash
# All apps
pnpm dev

# Only video-downloader
pnpm dev --filter=apps/video-downloader
```

The app runs at `http://localhost:3000`.

### Lint and type-check

```bash
pnpm lint
pnpm check-types
```

---

## Docker

Build the image from the repo root (uses `scripts/docker-build.mjs`):

```bash
pnpm docker video-downloader
```

The Dockerfile uses a multi-stage Turborepo prune build. The final image is based on `node:20-alpine` with `ffmpeg`, `yt-dlp`, and `gallery-dl` installed.

---

## Deployment

### Full deploy (build → Docker → Helm)

Run the end-to-end deploy workflow from the repo root. It bumps the patch version, builds the Next.js app, builds and pushes the Docker image, then runs `helm upgrade --install`:

```bash
pnpm deploy-app video-downloader
```

Skip all interactive prompts with `-y`:

```bash
pnpm deploy-app video-downloader -y
```

### Helm only (config-only changes)

When only Helm chart values or templates changed (e.g. nginx configmap) and no new Docker image is needed:

```bash
helm upgrade --install video-downloader ./apps/video-downloader/helm \
  --namespace video-downloader-2 \
  --reuse-values
```

`--reuse-values` keeps the existing `image.tag` and other overrides — only the chart templates are re-applied.

### Check deployment status

```bash
helm status video-downloader -n video-downloader-2
kubectl rollout status deploy/video-downloader -n video-downloader-2
kubectl logs deploy/video-downloader -n video-downloader-2
```

---

## Environment variables

Copy `env.example` to `.env` before deploying:

```bash
cp env.example .env
```

| Variable | Description |
|---|---|
| `DOCKER_REGISTRY` | Docker registry prefix (e.g. `docker` for Docker Hub) |
| `NAMESPACE` | Kubernetes namespace for Helm deployments |
| `GROQ_API_KEY` | Optional Groq API key |
| `WS_BROKER_URL` | Internal URL of the ws-broker service |

---

## Media & binaries

Shared media is stored on the host at `/shared-master` and mounted into every pod at `/app/media`. The nginx sidecar serves:

- `/api/media/**` — downloaded and processed video files
- `/media/binaries/**` — `server-video-editor` installer binaries (`.deb`, `.exe`)

Place installer binaries at `/shared-master/binaries/` on the host node.
