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

### Reset / restart deployment

Restart the running pods without redeploying (picks up new ConfigMap/Secret values):

```bash
kubectl rollout restart deployment/video-downloader -n video-downloader-2
```

Full uninstall and redeploy (use when the release is in a broken state):

```bash
helm uninstall video-downloader -n video-downloader-2
pnpm helm video-downloader
```

---

### WireGuard VPN sidecar

The WireGuard sidecar routes all public-IP egress from the pod through a Surfshark server so that yt-dlp calls leave the cluster behind a VPN IP instead of the node's real IP. It is disabled by default (`wireguard.enabled: false` in `values.yaml`).

#### How it works

All containers in a Kubernetes pod share a single network namespace. wg-quick injects per-prefix routes for every CIDR in `AllowedIPs` into the shared routing table, so the `video-downloader` container's connections to public IPs automatically flow through `wg0` without any application changes.

#### wg0.conf requirements

Three rules that must be followed — each one has a specific reason:

| Rule                                               | Why                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use public-only `AllowedIPs` — **not** `0.0.0.0/0` | `0.0.0.0/0` triggers wg-quick's policy-routing mode, which installs kernel `ip rule` entries before the tunnel is established and breaks pod networking during startup. Split AllowedIPs uses simple per-prefix route injection instead.                                                                                               |
| Add `PostUp`/`PreDown` endpoint host routes        | The Surfshark server IP (e.g. `212.102.44.115`) falls inside the `208.0.0.0/4` AllowedIPs range. Without a `/32` host route via `eth0`, WireGuard's own handshake UDP packets loop back through `wg0` and the tunnel never connects (`0 B received`).                                                                                  |
| Omit `DNS =`                                       | All containers in the pod share the network namespace. wg-quick's DNS management redirects port-53 traffic through the VPN, breaking DNS for every container including `video-downloader`. Let Kubernetes CoreDNS handle DNS — it resolves via a `10.x.x.x` ClusterIP that is excluded from `AllowedIPs` and always routes via `eth0`. |

Minimal working `wg0.conf` (`apps/video-downloader/us-den.conf`):

```ini
[Interface]
Address    = 10.14.0.2/16
PrivateKey = <your-private-key>
# ① Prevent the VPN endpoint's own UDP traffic from looping through wg0
PostUp  = ip route add $(wg show wg0 endpoints | awk '{print $2}' | sed 's/:[0-9]*$//')/32 via 169.254.1.1
PreDown = ip route del $(wg show wg0 endpoints | awk '{print $2}' | sed 's/:[0-9]*$//')/32 via 169.254.1.1 2>/dev/null || true
# ② Bypass VPN for Groq API — Surfshark IPs are blocked by Groq (returns 403)
PostUp  = GROQ_IP=$(getent hosts api.groq.com | awk '{print $1; exit}'); ip route add ${GROQ_IP}/32 via 169.254.1.1 dev eth0
PreDown = GROQ_IP=$(getent hosts api.groq.com | awk '{print $1; exit}'); ip route del ${GROQ_IP}/32 2>/dev/null || true

[Peer]
PublicKey  = <server-public-key>
AllowedIPs = 0.0.0.0/5, 8.0.0.0/7, 11.0.0.0/8, 12.0.0.0/6, 16.0.0.0/4, 32.0.0.0/3, 64.0.0.0/2, 128.0.0.0/3, 160.0.0.0/5, 168.0.0.0/8, 169.0.0.0/9, 169.128.0.0/10, 169.192.0.0/11, 169.224.0.0/12, 169.240.0.0/13, 169.248.0.0/14, 169.252.0.0/15, 169.255.0.0/16, 170.0.0.0/15, 172.0.0.0/12, 172.32.0.0/11, 172.64.0.0/10, 172.128.0.0/9, 173.0.0.0/8, 174.0.0.0/7, 176.0.0.0/4, 192.0.0.0/9, 192.128.0.0/11, 192.160.0.0/13, 192.169.0.0/16, 192.170.0.0/15, 192.172.0.0/14, 192.176.0.0/12, 192.192.0.0/10, 193.0.0.0/8, 194.0.0.0/7, 196.0.0.0/6, 200.0.0.0/5, 208.0.0.0/4
Endpoint   = us-den.prod.surfshark.com:51820
```

The `AllowedIPs` list is the mathematical complement of `10.0.0.0/8 + 169.254.0.0/16 + 172.16.0.0/12 + 192.168.0.0/16` — all public unicast IPv4 space. Private ranges route via `eth0` (Calico) and are never sent to the VPN. The `PostUp` dynamically reads the resolved endpoint IP from the live WireGuard config at startup, so it works correctly even if Surfshark changes the server IP.

#### Enabling the sidecar

**1.** Download a WireGuard config from Surfshark dashboard → VPN → Manual Setup → WireGuard → US server. Edit it to match the format above (remove `DNS =`, replace `AllowedIPs`, add `PostUp`/`PreDown`). Save as `apps/video-downloader/us-den.conf`.

**2.** Create the Kubernetes secret:

```bash
kubectl create secret generic video-downloader-wireguard \
  --from-file=wg0.conf=./apps/video-downloader/us-den.conf \
  -n video-downloader-2
```

**3.** Enable in `helm/values.yaml`:

```yaml
wireguard:
  enabled: true
```

**4.** Deploy:

```bash
pnpm helm video-downloader -y
```

#### Verifying the tunnel

```bash
# Handshake must show "latest handshake" and "transfer: X received" > 0
kubectl exec -n video-downloader-2 deploy/video-downloader \
  -c wireguard -- wg show wg0

# Must return a US Surfshark IP, not the node's real IP
kubectl exec -n video-downloader-2 deploy/video-downloader \
  -c video-downloader -- curl -s --max-time 15 https://ipinfo.io/ip
```

#### Updating the config

```bash
kubectl create secret generic video-downloader-wireguard \
  --from-file=wg0.conf=./apps/video-downloader/us-den.conf \
  -n video-downloader-2 \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/video-downloader -n video-downloader-2
```

---

## Coupon management

Coupons are managed via the `scripts/coupon` CLI using `kubectl exec`. Pass `INTERNAL_SECRET` inline — it must match the value in your Kubernetes secret.

### Create coupons

```bash
kubectl exec -n video-downloader-2 deploy/video-downloader -c video-downloader -- \
  sh -c 'INTERNAL_SECRET=<your-secret> coupon create -quantity <n> -value <credits> [-max-redemptions <n>]'
```

| Flag                   | Required        | Description                                 |
| ---------------------- | --------------- | ------------------------------------------- |
| `-quantity <n>`        | No (default: 1) | Number of distinct coupon codes to generate |
| `-value <credits>`     | Yes             | Credit amount each coupon grants            |
| `-max-redemptions <n>` | No (default: 1) | How many times each code can be redeemed    |

Example — generate 5 single-use coupons worth 1500 credits each:

```bash
kubectl exec -n video-downloader-2 deploy/video-downloader -c video-downloader -- \
  sh -c 'INTERNAL_SECRET=<your-secret> coupon create -quantity 5 -value 1500'
```

### List coupons

```bash
kubectl exec -n video-downloader-2 deploy/video-downloader -c video-downloader -- \
  sh -c 'INTERNAL_SECRET=<your-secret> coupon list [-redeemed true|false] [-amount <credits>]'
```

| Flag                    | Description                 |
| ----------------------- | --------------------------- |
| `-redeemed true\|false` | Filter by redemption status |
| `-amount <credits>`     | Filter by credit value      |

Examples:

```bash
# All coupons
kubectl exec -n video-downloader-2 deploy/video-downloader -c video-downloader -- \
  sh -c 'INTERNAL_SECRET=<your-secret> coupon list'

# Only unredeemed coupons
kubectl exec -n video-downloader-2 deploy/video-downloader -c video-downloader -- \
  sh -c 'INTERNAL_SECRET=<your-secret> coupon list -redeemed false'

# Unredeemed 1500-credit coupons
kubectl exec -n video-downloader-2 deploy/video-downloader -c video-downloader -- \
  sh -c 'INTERNAL_SECRET=<your-secret> coupon list -redeemed false -amount 1500'
```

Output is formatted JSON with `code`, `credits`, `redeemed`, `maxRedemptions`, `createdAt`, `fullyRedeemed`, and `redemptions`.

---

## Environment variables

Copy `env.example` to `.env` before deploying:

```bash
cp env.example .env
```

| Variable                 | How to set                                                      | Description                                                                                                                   |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `MONGO_URI`              | `helm/values.yaml` → `env`                                      | MongoDB connection string (defaults to in-cluster service)                                                                    |
| `GROQ_API_KEY`           | K8s Secret `vd2-secrets` → `helm/values.yaml` → `envFromSecret` | Groq API key for subtitle translation. **Note:** route via `eth0` (not VPN) in `wg0.conf` — Surfshark IPs are blocked by Groq |
| `SCRAPECREATORS_API_KEY` | K8s Secret `vd2-secrets` → `helm/values.yaml` → `envFromSecret` | ScrapeCreators API key for comment scraping (TikTok, Instagram, Facebook)                                                     |
| `LOG_LEVEL`              | `helm/values.yaml` → `env`                                      | Override default log level (`debug` in dev, `info` in prod)                                                                   |

To add a secret value:

```bash
# Create (or patch) the shared secret
kubectl create secret generic vd2-secrets \
  --from-literal=groq-api-key=<YOUR_GROQ_KEY> \
  -n video-downloader-2 \
  --dry-run=client -o yaml | kubectl apply -f -

# Then redeploy (Helm only — no new image needed)
helm upgrade --install video-downloader ./apps/video-downloader/helm \
  --namespace video-downloader-2 \
  --reuse-values
```

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
