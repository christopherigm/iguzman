# video-downloader

A Next.js PWA for downloading and client-side processing of videos. Uses FFmpeg compiled to WebAssembly to run entirely in the browser — no server-side video processing required.

## Features

- Download videos via yt-dlp and gallery-dl (YouTube, TikTok, Instagram, Pinterest, Facebook, X, Rednote, Tidal)
- Client-side FFmpeg processing: black bar removal, FPS interpolation (60/90/120), H.264 conversion
- Server offloading: route FFmpeg jobs to a connected `server-video-editor` agent over WebSockets
- Caption/subtitle support: fetch available captions, burn-in with custom styling and animation effects
- Subtitle translation via Groq LLM (preserves SRT format)
- Admin dashboard with real-time task status and 24h activity tracking
- Multi-locale UI (en, es, de, fr, pt)
- Media served by an nginx sidecar for high-performance large-file delivery

---

## Download process flow

Paste a video URL (YouTube, TikTok, Instagram, etc.) into the input field and the app immediately starts downloading via yt-dlp or gallery-dl. Once the download begins, processing options become available — you can enable black bar removal, convert FPS (60/90/120), encode to H.264, or fetch and burn-in subtitles. When download and any processing complete, the video is served from the nginx sidecar (or the app as fallback) and added to your completed videos list for re-processing or downloading again.

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

The Dockerfile uses a multi-stage Turborepo prune build. The final image is based on `node:20-alpine` with `ffmpeg`, `yt-dlp`, `gallery-dl`, `python3`, `curl`, `jq`, and `wget` installed.

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
| `MONGO_URI` | MongoDB connection string (defaults to in-cluster service) |
| `GROQ_API_KEY` | Optional Groq API key for subtitle translation |
| `WS_BROKER_URL` | Internal URL of the ws-broker service |
| `LOG_LEVEL` | Override default log level (`debug` in dev, `info` in prod) |

---

## API routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/download-video` | Start a download task (`url`, `justAudio?`, `maxHeight?`, `checkCodec?`, `captionsEnabled?`, `captionUrl?`) |
| `GET` | `/api/download-video/[id]` | Poll task progress |
| `POST` | `/api/server-processing` | Route an FFmpeg job to a registered server client (`clientUuid`, `op`, `taskId`, `params`) |
| `GET` | `/api/server-processing/[taskId]` | Poll server job result |
| `GET` | `/api/video-metadata` | Fetch video formats and available captions for a URL |
| `POST/GET/DELETE` | `/api/ws-clients` | Register, list, or deregister server-video-editor clients |
| `POST` | `/api/groq/chat` | SSE proxy to Groq API for subtitle translation |
| `GET` | `/api/media/[filename]` | Fallback file serving (normally handled by the nginx sidecar) |

Valid server-processing ops: `interpolateFps`, `removeBlackBars`, `convertToH264`, `burnSubtitles`.

---

## Media & binaries

Shared media is stored on the host at `/shared-master` and mounted into every pod at `/app/media`. The nginx sidecar serves:

- `/api/media/**` — downloaded and processed video files
- `/media/binaries/**` — `server-video-editor` installer binaries (`.deb`, `.exe`)

Place installer binaries at `/shared-master/binaries/` on the host node.

Pod health is checked via a file probe at `/app/media/.healthy` (startup: 30 attempts, liveness: ongoing).

---

## Architecture notes

**SharedArrayBuffer requirement:** FFmpeg WASM requires `SharedArrayBuffer`, which is gated behind cross-origin isolation. `next.config.ts` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on all routes.

**Component split:**
- `PinnedVideoItem` — active downloads, embeds `useFFmpeg` directly, handles all client-side processing
- `ReadOnlyVideoItem` — completed videos, supports re-processing
- `VideoExtraActions` — FPS, H.264 convert, black bar removal panel
- `BurnCaptionsModal` — caption styling (font, color, alignment, border, animation)
- `WsClientPanel` — device selector (This Device vs. connected servers)
- `InfinitePage` — infinite-scroll gallery view

**State management:** Zustand (`use-video-store.ts`) persists pinned and completed video lists. Filter state in `VideoGrid` lives in URL search params (`?platform=`, `?status=`, `?audio=`, `?per=`, `?page=`), making filters bookmarkable.

**Download polling** uses Server-Sent Events (`/api/download-video/[id]/stream`). `use-poll-task.ts` uses `EventSource` to receive push updates.
