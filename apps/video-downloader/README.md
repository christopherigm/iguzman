# video-downloader (Media 2 Go)

**Media 2 Go** (deployed at [media2go.app](https://media2go.app)) is a Next.js PWA for downloading videos from major social and streaming platforms, with full offline support via the browser's Origin Private File System (OPFS). Videos can be stored directly on the device so they remain accessible without a network connection. Heavy FFmpeg work can run either **client-side** through FFmpeg compiled to WebAssembly or **server-side** on the app's own backend (credit-metered); both paths share the same operation set.

## Features

- **Multi-platform downloads** via yt-dlp and gallery-dl: YouTube, TikTok, Instagram, Pinterest, Facebook, X, Rednote, Tidal
- **Offline-first storage**: save videos, thumbnails, captions, and comments to OPFS for on-device playback without a connection
- **Client-side FFmpeg processing** (FFmpeg WASM in a Web Worker): black bar removal, FPS interpolation (60/90/120), H.264 / H.265 conversion, scale-down, subtitle burn-in
- **Server-side FFmpeg processing**: the same operations can run on the app backend (`/api/server-processing`) for devices that can't handle WASM, metered against the credits system
- **Caption/subtitle support**: fetch available captions, burn-in with custom styling and animation effects
- **Subtitle translation** via Groq LLM, with an OpenRouter fallback on rate-limit (preserves SRT format)
- **Subtitle generation (diarization)**: transcribe a video's audio into a timed SRT via an external diarization service (`/api/diarize`)
- **Comment scraping**: fetch and browse post comments; yt-dlp is the primary source, with ScrapeCreators as a fallback for TikTok, Instagram, and Facebook
- **Credits & payments**: usage is metered in credits, topped up via Stripe checkout or redeemable coupon codes
- **Music Player** and **Reel Mode**: an audio player for downloaded tracks and an infinite vertical gallery of saved videos
- **Multi-locale UI** (en, es, de, fr, pt)
- **R2 object storage**: downloaded and processed media is stored in Cloudflare R2 (S3-compatible) in production, with local disk used in development

---

## Download process flow

Paste a video URL (YouTube, TikTok, Instagram, etc.) into the input field and the app immediately starts downloading via yt-dlp or gallery-dl. Before or during download you can opt in to **OPFS storage** (saves the file locally on-device for offline access), enable **comment scraping** (downloads the post's comments as a JSON file stored alongside the video), or configure processing options such as black bar removal, FPS conversion, H.264/H.265 encode, scale-down, and subtitle burn-in. When the download and any processing complete, the video is served from R2 (or local disk in dev), or from OPFS if stored on-device, and added to your completed videos list for re-processing or downloading again. Comments can be browsed inline in the video card.

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

To test the Stripe credits flow locally, forward webhooks to the dev server in a second terminal:

```bash
pnpm --filter=video-downloader dev:stripe   # stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

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

The Dockerfile uses a multi-stage Turborepo prune build. The final image is based on `node:22-alpine` with `ffmpeg`, `yt-dlp`, and `gallery-dl` installed. The `yt-dlp`/`gallery-dl` layer is keyed on the latest yt-dlp release so it rebuilds whenever a new version ships.

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

`--reuse-values` keeps the existing `image.tag` and other overrides - only the chart templates are re-applied.

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

Three rules that must be followed - each one has a specific reason:

| Rule                                               | Why                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use public-only `AllowedIPs` - **not** `0.0.0.0/0` | `0.0.0.0/0` triggers wg-quick's policy-routing mode, which installs kernel `ip rule` entries before the tunnel is established and breaks pod networking during startup. Split AllowedIPs uses simple per-prefix route injection instead.                                                                                               |
| Add `PostUp`/`PreDown` endpoint host routes        | The Surfshark server IP (e.g. `212.102.44.115`) falls inside the `208.0.0.0/4` AllowedIPs range. Without a `/32` host route via `eth0`, WireGuard's own handshake UDP packets loop back through `wg0` and the tunnel never connects (`0 B received`).                                                                                  |
| Omit `DNS =`                                       | All containers in the pod share the network namespace. wg-quick's DNS management redirects port-53 traffic through the VPN, breaking DNS for every container including `video-downloader`. Let Kubernetes CoreDNS handle DNS - it resolves via a `10.x.x.x` ClusterIP that is excluded from `AllowedIPs` and always routes via `eth0`. |

Minimal working `wg0.conf` (`apps/video-downloader/us-den.conf`):

```ini
[Interface]
Address    = 10.14.0.2/16
PrivateKey = <your-private-key>
# ① Prevent the VPN endpoint's own UDP traffic from looping through wg0
PostUp  = ip route add $(wg show wg0 endpoints | awk '{print $2}' | sed 's/:[0-9]*$//')/32 via 169.254.1.1
PreDown = ip route del $(wg show wg0 endpoints | awk '{print $2}' | sed 's/:[0-9]*$//')/32 via 169.254.1.1 2>/dev/null || true
# ② Bypass VPN for Groq API - Surfshark IPs are blocked by Groq (returns 403)
PostUp  = GROQ_IP=$(getent hosts api.groq.com | awk '{print $1; exit}'); ip route add ${GROQ_IP}/32 via 169.254.1.1 dev eth0
PreDown = GROQ_IP=$(getent hosts api.groq.com | awk '{print $1; exit}'); ip route del ${GROQ_IP}/32 2>/dev/null || true

[Peer]
PublicKey  = <server-public-key>
AllowedIPs = 0.0.0.0/5, 8.0.0.0/7, 11.0.0.0/8, 12.0.0.0/6, 16.0.0.0/4, 32.0.0.0/3, 64.0.0.0/2, 128.0.0.0/3, 160.0.0.0/5, 168.0.0.0/8, 169.0.0.0/9, 169.128.0.0/10, 169.192.0.0/11, 169.224.0.0/12, 169.240.0.0/13, 169.248.0.0/14, 169.252.0.0/15, 169.255.0.0/16, 170.0.0.0/15, 172.0.0.0/12, 172.32.0.0/11, 172.64.0.0/10, 172.128.0.0/9, 173.0.0.0/8, 174.0.0.0/7, 176.0.0.0/4, 192.0.0.0/9, 192.128.0.0/11, 192.160.0.0/13, 192.169.0.0/16, 192.170.0.0/15, 192.172.0.0/14, 192.176.0.0/12, 192.192.0.0/10, 193.0.0.0/8, 194.0.0.0/7, 196.0.0.0/6, 200.0.0.0/5, 208.0.0.0/4
Endpoint   = us-den.prod.surfshark.com:51820
```

The `AllowedIPs` list is the mathematical complement of `10.0.0.0/8 + 169.254.0.0/16 + 172.16.0.0/12 + 192.168.0.0/16` - all public unicast IPv4 space. Private ranges route via `eth0` (Calico) and are never sent to the VPN. The `PostUp` dynamically reads the resolved endpoint IP from the live WireGuard config at startup, so it works correctly even if Surfshark changes the server IP.

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

Coupons are managed via the `scripts/coupon` CLI using `kubectl exec`. Pass `INTERNAL_SECRET` inline - it must match the value in your Kubernetes secret.

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

Example - generate 5 single-use coupons worth 1500 credits each:

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

| Variable                              | How to set                                                      | Description                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `MONGO_URI`                           | `helm/values.yaml` → `env`                                      | MongoDB connection string (tasks, credits, coupons)                                                                          |
| `R2_ACCOUNT_ID`                       | K8s Secret `vd2-secrets` → `envFromSecret`                      | Cloudflare R2 account ID. **Setting this enables R2 storage**; unset falls back to local disk                               |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | K8s Secret `vd2-secrets` → `envFromSecret`                | R2 (S3-compatible) credentials                                                                                              |
| `R2_BUCKET_NAME`                      | K8s Secret `vd2-secrets` → `envFromSecret`                      | R2 bucket that holds downloaded/processed media                                                                            |
| `R2_PUBLIC_URL`                       | `helm/values.yaml` → `env`                                      | Public base URL/CDN for served R2 objects                                                                                  |
| `GROQ_API_KEY`                        | K8s Secret `vd2-secrets` → `envFromSecret`                      | Groq API key for subtitle translation. **Note:** route via `eth0` (not VPN) in `wg0.conf` - Surfshark IPs are blocked by Groq |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | K8s Secret `vd2-secrets` → `envFromSecret`                 | OpenRouter fallback for `/api/groq/chat` when Groq returns 429. Use a plain instruct model, **not** a reasoning model        |
| `SCRAPECREATORS_API_KEY`              | K8s Secret `vd2-secrets` → `envFromSecret`                      | ScrapeCreators API key for comment/metadata scraping (TikTok, Instagram, Facebook)                                          |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | K8s Secret `vd2-secrets` → `envFromSecret`             | Stripe keys for the credits checkout and webhook receiver                                                                  |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`  | `helm/values.yaml` → `env`                                      | Stripe publishable key (client-side checkout)                                                                              |
| `NEXT_PUBLIC_BASE_URL`                | `helm/values.yaml` → `env`                                      | Public site URL, used for Stripe checkout return URLs                                                                      |
| `DIARIZATION_URL` / `DIARIZATION_API_KEY` | K8s Secret `vd2-secrets` → `envFromSecret`                 | Endpoint + key for the external diarization service backing `/api/diarize`                                                 |
| `INTERNAL_SECRET`                     | K8s Secret `vd2-secrets` → `envFromSecret`                      | Shared secret guarding `/api/internal/coupons` and the `coupon` CLI                                                        |
| `LOG_LEVEL`                           | `helm/values.yaml` → `env`                                      | Override default log level (`debug` in dev, `info` in prod)                                                                |

To add a secret value:

```bash
# Create (or patch) the shared secret
kubectl create secret generic vd2-secrets \
  --from-literal=groq-api-key=<YOUR_GROQ_KEY> \
  -n video-downloader-2 \
  --dry-run=client -o yaml | kubectl apply -f -

# Then redeploy (Helm only - no new image needed)
helm upgrade --install video-downloader ./apps/video-downloader/helm \
  --namespace video-downloader-2 \
  --reuse-values
```

---

## API routes

| Method   | Path                       | Description                                                                                                                                     |
| -------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/download-video`      | Start a download task (`url`, `justAudio?`, `maxHeight?`, `checkCodec?`, `captionsEnabled?`, `captionUrl?`, `commentsEnabled?`, `maxComments?`) |
| `GET`    | `/api/download-video/[id]` | Poll task progress (the client polls this on a 2 s interval)                                                                                    |
| `DELETE` | `/api/download-video/[id]` | Delete a task and its underlying media file (from R2 or local disk)                                                                             |
| `POST`   | `/api/server-processing`   | Run a server-side FFmpeg job (`op`, `taskId`, `params`); creates a new task that is polled via `/api/download-video/[id]`                       |
| `POST`   | `/api/diarize`             | Transcribe a task's audio into a timed SRT via the external diarization service                                                                 |
| `GET`    | `/api/video-metadata`      | Fetch video formats and available captions for a URL                                                                                            |
| `POST`   | `/api/social-metadata`     | Fetch social post metadata via ScrapeCreators (credit-metered)                                                                                  |
| `POST`   | `/api/groq/chat`           | SSE proxy to Groq for subtitle translation (falls back to OpenRouter on 429)                                                                    |
| `GET`    | `/api/credits/balance`     | Read the caller's current credit balance                                                                                                        |
| `POST`   | `/api/credits/purchase`    | Create a Stripe checkout session for a credit pack                                                                                              |
| `POST`   | `/api/credits/redeem`      | Redeem a coupon code for credits                                                                                                                |
| `POST`   | `/api/webhooks/stripe`     | Stripe webhook receiver (credits a balance after successful payment)                                                                            |
| `POST`   | `/api/internal/coupons`    | Internal coupon management (guarded by `INTERNAL_SECRET`; used by the `coupon` CLI)                                                             |
| `GET`    | `/api/media/[filename]`    | Serve a media file (presigned R2 redirect in production, local disk in dev)                                                                     |
| `POST`   | `/api/media/multipart`     | Multipart upload of large processed media to R2                                                                                                 |
| `POST`   | `/api/media/stage`         | Stage an uploaded file before finalizing a task                                                                                                 |
| `GET`    | `/api/health`              | Liveness/readiness probe                                                                                                                        |

Valid server-processing ops: `interpolateFps`, `convertToH264`, `convertToH265`, `removeBlackBars`, `burnSubtitles`, `scaleDown`. The `burnSubtitles` op also accepts `translate` / `translateLang` to translate the SRT (via Groq) before burning it in.

---

## Media storage

In production, downloaded and processed media is stored in **Cloudflare R2** (S3-compatible object storage) - enabled whenever `R2_ACCOUNT_ID` is set. `/api/media/[filename]` issues a presigned redirect to the object, and large processed outputs are uploaded via `/api/media/multipart`. The host-path media volume is disabled (`hostPathVolume.enabled: false`).

In development (no R2 configured), files are written to `./public/media` and served by Next.js directly.

Pod health is checked over HTTP at `/api/health` (used by both the readiness and liveness probes).

---

## Architecture notes

**SharedArrayBuffer requirement:** FFmpeg WASM requires `SharedArrayBuffer`, which is gated behind cross-origin isolation. `next.config.js` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on all routes, plus `Cross-Origin-Resource-Policy: cross-origin` on `/media/*` (so the OPFS migration `fetch()` can read R2/redirected files) and `Cache-Control: no-store` on `/sw.js`.

**Component split:**

- `pinned-video-item-client` - active downloads processed on-device, embeds `useFFmpeg` (WASM) directly
- `pinned-video-item-server` - active downloads processed on the app backend via `/api/server-processing`
- `pinned-video-item-downloading` - the in-progress download card
- `readonly-video-item` - completed videos, supports re-processing
- `video-toolbar` - per-video actions (FPS, H.264/H.265 convert, black bar removal, scale-down, captions)
- `burn-captions-modal` - caption styling (font, color, alignment, border, animation)
- `video-comments` - renders downloaded comments inline in the video card (supports nested replies, avatars, likes)
- `music-player` - audio player for downloaded tracks
- `infinite-page` - infinite-scroll gallery view (also backs Reel Mode)

**OPFS storage:** When enabled for a video, the downloaded file, thumbnail, captions, and comments JSON are all written to the browser's Origin Private File System (`lib/opfs.ts`). Stored videos are served from `blob:` URLs derived from OPFS reads, making them available offline. `OPFSUrlProvider` (`opfs-url-context.tsx`) manages the blob URL lifecycle (registration and revocation) for the whole page. `lib/opfs-processing.ts` handles migrating a processed output back into OPFS and cleaning up the old key.

**Comment scraping:** yt-dlp is used as the primary comment source. For TikTok, Instagram, and Facebook posts where yt-dlp returns no comments, the server falls back to ScrapeCreators (`lib/scrapecreators.ts`) using the `SCRAPECREATORS_API_KEY` env var (or a per-request key supplied via `x-scrapecreators-key`). Comments are stored as a JSON file on disk and optionally in OPFS (`opfsCommentsKey`).

**State management:** Zustand (`use-video-store.ts`) persists pinned and completed video lists; `use-credits-store.ts` tracks the credit balance. Filter state in `VideoGrid` lives in URL search params (`?platform=`, `?status=`, `?audio=`, `?per=`, `?page=`), making filters bookmarkable.

**Download polling:** `use-poll-task.ts` polls `/api/download-video/[id]` on a 2 s interval (with abort + error backoff). Both downloads and server-side processing jobs are tracked as tasks and polled the same way.

**Credits:** operations are metered in credits (`lib/operation-credits.ts`, `lib/credit-packs.ts`), debited and refunded through `lib/credits-middleware.ts`, and persisted in MongoDB (`lib/credits-db.ts`). Balances are topped up via Stripe checkout (`/api/credits/purchase` + the `/api/webhooks/stripe` receiver) or by redeeming coupon codes.
