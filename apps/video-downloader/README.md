# video-downloader

A Next.js PWA for downloading videos from major social and streaming platforms, with full offline support via the browser's Origin Private File System (OPFS). Videos are stored directly on the device so they remain accessible without a network connection. All video processing runs client-side through FFmpeg compiled to WebAssembly — no server-side video processing required.

## Features

- **Multi-platform downloads** via yt-dlp and gallery-dl: YouTube, TikTok, Instagram, Pinterest, Facebook, X, Rednote, Tidal
- **Offline-first storage**: save videos, thumbnails, and captions to OPFS for on-device playback without a connection
- **Comment scraping**: fetch and browse post comments for TikTok, Instagram, and Facebook via ScrapeCreators; yt-dlp comment extraction used as primary source with ScrapeCreators as fallback
- **Client-side FFmpeg processing**: black bar removal, FPS interpolation (60/90/120), H.264/H.265 conversion
- **Server offloading**: route FFmpeg jobs to a connected `server-video-editor` agent over WebSockets
- **Caption/subtitle support**: fetch available captions, burn-in with custom styling and animation effects
- **Subtitle translation** via Groq LLM (preserves SRT format)
- **Admin dashboard** with real-time task status and 24h activity tracking
- **Multi-locale UI** (en, es, de, fr, pt)
- Media served by an nginx sidecar for high-performance large-file delivery

---

## Download process flow

Paste a video URL (YouTube, TikTok, Instagram, etc.) into the input field and the app immediately starts downloading via yt-dlp or gallery-dl. Before or during download you can opt in to **OPFS storage** (saves the file locally on-device for offline access), enable **comment scraping** (downloads the post's comments as a JSON file stored alongside the video), or configure processing options such as black bar removal, FPS conversion, H.264 encode, and subtitle burn-in. When the download and any processing complete, the video is served from OPFS (if stored) or the nginx sidecar, and added to your completed videos list for re-processing or downloading again. Comments can be browsed inline in the video card.

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

| Variable                 | Description                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `MONGO_URI`              | MongoDB connection string (defaults to in-cluster service)                         |
| `GROQ_API_KEY`           | Optional Groq API key for subtitle translation                                     |
| `WS_BROKER_URL`          | Internal URL of the ws-broker service                                              |
| `SCRAPECREATORS_API_KEY` | Optional ScrapeCreators API key for comment scraping (TikTok, Instagram, Facebook) |
| `LOG_LEVEL`              | Override default log level (`debug` in dev, `info` in prod)                        |

---

## API routes

| Method            | Path                              | Description                                                                                                                                     |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`            | `/api/download-video`             | Start a download task (`url`, `justAudio?`, `maxHeight?`, `checkCodec?`, `captionsEnabled?`, `captionUrl?`, `commentsEnabled?`, `maxComments?`) |
| `GET`             | `/api/download-video/[id]`        | Poll task progress                                                                                                                              |
| `POST`            | `/api/server-processing`          | Route an FFmpeg job to a registered server client (`clientUuid`, `op`, `taskId`, `params`)                                                      |
| `GET`             | `/api/server-processing/[taskId]` | Poll server job result                                                                                                                          |
| `GET`             | `/api/video-metadata`             | Fetch video formats and available captions for a URL                                                                                            |
| `POST/GET/DELETE` | `/api/ws-clients`                 | Register, list, or deregister server-video-editor clients                                                                                       |
| `POST`            | `/api/groq/chat`                  | SSE proxy to Groq API for subtitle translation                                                                                                  |
| `GET`             | `/api/media/[filename]`           | Fallback file serving (normally handled by the nginx sidecar)                                                                                   |

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
- `VideoComments` — renders downloaded comments inline in the video card (supports nested replies, avatars, likes)
- `WsClientPanel` — device selector (This Device vs. connected servers)
- `InfinitePage` — infinite-scroll gallery view

**OPFS storage:** When enabled for a video, the downloaded file, thumbnail, captions, and comments JSON are all written to the browser's Origin Private File System (`lib/opfs.ts`). Stored videos are served from `blob:` URLs derived from OPFS reads, making them available offline. `OPFSUrlProvider` (`opfs-url-context.tsx`) manages the blob URL lifecycle (registration and revocation) for the whole page. `lib/opfs-processing.ts` handles migrating a processed output back into OPFS and cleaning up the old key.

**Comment scraping:** yt-dlp is used as the primary comment source. For TikTok, Instagram, and Facebook posts where yt-dlp returns no comments, the server falls back to ScrapeCreators (`lib/scrapecreators.ts`) using the `SCRAPECREATORS_API_KEY` env var (or a per-request key supplied via `x-scrapecreators-key`). Comments are stored as a JSON file on disk and optionally in OPFS (`opfsCommentsKey`).

**State management:** Zustand (`use-video-store.ts`) persists pinned and completed video lists. Filter state in `VideoGrid` lives in URL search params (`?platform=`, `?status=`, `?audio=`, `?per=`, `?page=`), making filters bookmarkable.

**Download polling** uses Server-Sent Events (`/api/download-video/[id]/stream`). `use-poll-task.ts` uses `EventSource` to receive push updates.
