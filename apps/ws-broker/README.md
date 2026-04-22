# ws-broker

WebSocket broker that routes FFmpeg processing jobs from the **video-downloader** web app to **server-video-editor** agents running on users' machines.

## Architecture

```
Browser (video-downloader UI)
  │
  └─▶ POST /api/processing-jobs  (video-downloader Next.js)
            │
            └─▶ POST /api/jobs  ────────────────▶  ws-broker  (this service)
                                                        │
                                         WS push: { type: "job", ... }
                                                        │
                                                        ▼
                                              server-video-editor
                                              (user's local machine)
                                                        │
                                         1. downloads input from vd2.iguzman.com.mx
                                         2. runs native FFmpeg
                                         3. PUT result to /api/media/:file
                                         4. WS: { type: "done", outputFile }
                                                        │
                                    WS done ────────────┘
                                        │
                               POST /api/processing-jobs/:jobId/complete
                                        │
                                        ▼
                               video-downloader updates DB + UI
```

**Why a separate broker?**
`server-video-editor` runs on users' local machines behind NAT and cannot be reached directly. It initiates an outbound WebSocket connection to this broker. Any `video-downloader` pod (3 replicas) then routes jobs to the connected client via the broker's REST API — no sticky sessions needed.

> **Important:** `replicaCount` must stay at **1**. WebSocket connections are held in memory; multiple replicas would split clients across pods.

---

## Client registration flow

1. Install the `server-video-editor` `.deb` package. `postinstall.sh` generates a UUID and writes it to `/opt/server-video-editor/config.json`.
2. The agent boots and connects to `wss://ws.vd2.iguzman.com.mx/ws`, sending `{ type: "auth", uuid }`.
3. The user opens the video-downloader UI and registers their UUID + a label via `POST /api/ws-clients`.
4. The broker looks up the UUID in the `ws_clients` MongoDB collection and responds with `{ type: "ack" }`, or closes with code 4001 if the UUID is not found.

---

## API reference

### WebSocket — `wss://ws.vd2.iguzman.com.mx/ws`

For `server-video-editor` agents only.

| Direction       | Message                                       |
| --------------- | --------------------------------------------- |
| Client → Broker | `{ type: "auth", uuid: "<UUID>" }`            |
| Broker → Client | `{ type: "ack" }` or close 4001               |
| Client → Broker | `{ type: "ping" }`                            |
| Broker → Client | `{ type: "pong" }`                            |
| Broker → Client | `{ type: "job", jobId, op, params }`          |
| Client → Broker | `{ type: "progress", jobId, percent: 0–100 }` |
| Client → Broker | `{ type: "done", jobId, outputFile }`         |
| Client → Broker | `{ type: "error", jobId, error }`             |

**Supported ops:** `interpolateFps`, `removeBlackBars`, `convertToH264`, `burnSubtitles`

### REST — internal (video-downloader → broker)

Endpoints are unauthenticated and exposed only within the K8s cluster network. Do not expose them publicly.

| Method | Path                 | Description                                              |
| ------ | -------------------- | -------------------------------------------------------- |
| `GET`  | `/healthz`           | Health check — returns `{ ok: true, connectedClients }`  |
| `GET`  | `/api/clients`       | List all registered clients with live `connected` status |
| `GET`  | `/api/clients/:uuid` | Single client status                                     |
| `POST` | `/api/jobs`          | Dispatch a job to a connected client                     |

**`POST /api/jobs` body:**

```json
{
  "clientUuid": "<UUID>",
  "op": "interpolateFps",
  "params": {
    "taskId": "<mongo-task-id>",
    "inputFile": "abc123.mp4",
    "fps": 60
  }
}
```

| Status | Meaning                                    |
| ------ | ------------------------------------------ |
| `201`  | `{ "jobId": "<uuid>" }` — job dispatched   |
| `400`  | Missing `clientUuid`, `op`, or `params`    |
| `404`  | Client UUID not registered in MongoDB      |
| `409`  | Client registered but not currently connected |

---

## Development

### Prerequisites

- Node.js ≥ 18
- pnpm (via corepack)
- MongoDB running locally on `127.0.0.1:27017`

### Run locally

```bash
# From repo root — install all workspace deps
pnpm install

# Start ws-broker in watch mode (port 3000)
pnpm dev --filter=ws-broker

# In another terminal, start video-downloader (port 3001)
pnpm dev --filter=video-downloader
```

Set `VIDEO_DOWNLOADER_URL` so job-completion callbacks reach the local video-downloader instance:

```bash
VIDEO_DOWNLOADER_URL=http://localhost:3001 pnpm dev --filter=ws-broker
```

### Environment variables

| Variable               | Default                                                          | Description                                                   |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `PORT`                 | `3000`                                                           | HTTP/WS listen port                                           |
| `MONGO_URI`            | `mongodb://127.0.0.1:27017` (dev) / K8s cluster URI (prod)      | MongoDB connection string                                     |
| `VIDEO_DOWNLOADER_URL` | `http://video-downloader.video-downloader-2.svc.cluster.local`  | URL of video-downloader for job completion callbacks          |
| `LOG_LEVEL`            | `info`                                                           | Pino log level (`trace`, `debug`, `info`, `warn`, `error`)    |

> In production (`NODE_ENV=production`), `MONGO_URI` defaults to the in-cluster MongoDB address. Override it via `values.yaml` or a K8s secret if needed.

### Type checking

```bash
pnpm check-types --filter=ws-broker
```

### Build

```bash
pnpm build --filter=ws-broker
# Output: apps/ws-broker/dist/index.js (CommonJS bundle, @repo/* deps inlined)
```

---

## Deployment

### 1. Build and push the Docker image

```bash
# From repo root
docker build -f apps/ws-broker/Dockerfile -t christopherguzman/ws-broker:latest .
docker push christopherguzman/ws-broker:latest
```

Or use the monorepo docker script:

```bash
pnpm docker --filter=ws-broker
```

### 2. Deploy with Helm

```bash
helm upgrade --install ws-broker apps/ws-broker/helm \
  --namespace video-downloader-2 \
  --create-namespace
```

`MONGO_URI` and `VIDEO_DOWNLOADER_URL` are set directly in `values.yaml`. No Kubernetes secret is required unless you want to override them.

### 3. Verify

```bash
# Pod is running
kubectl get pods -n video-downloader-2 -l app.kubernetes.io/name=ws-broker

# Health check
curl https://ws.vd2.iguzman.com.mx/healthz
# → {"ok":true,"connectedClients":0}
```

---

## MongoDB collections

Both collections live in the `videos` database (shared with video-downloader).

### `ws_clients`

Registered `server-video-editor` agents.

| Field             | Type            | Description                                   |
| ----------------- | --------------- | --------------------------------------------- |
| `uuid`            | string (unique) | Generated at install time by `postinstall.sh` |
| `label`           | string          | Human-readable name set by the user           |
| `registeredAt`    | Date            | When the user registered this agent in the UI |
| `lastConnectedAt` | Date\|null      | Last successful WS auth                       |
| `lastSeenAt`      | Date\|null      | Last message received                         |

### `processing_jobs`

FFmpeg job history.

| Field         | Type            | Description                                                                  |
| ------------- | --------------- | ---------------------------------------------------------------------------- |
| `jobId`       | string (unique) | UUID assigned at dispatch time                                               |
| `clientUuid`  | string          | Which agent handled this job                                                 |
| `taskId`      | string          | Links to `tasks` collection in video-downloader                              |
| `op`          | string          | `interpolateFps` \| `removeBlackBars` \| `convertToH264` \| `burnSubtitles` |
| `params`      | object          | Op-specific params (e.g. `fps`, `inputFile`, `subtitlesFile`)                |
| `status`      | string          | `pending` → `dispatched` → `processing` → `done` \| `error`                 |
| `progress`    | number          | 0–100, updated via WS progress messages                                      |
| `outputFile`  | string\|null    | New filename after successful upload                                         |
| `error`       | string\|null    | Error message on failure                                                     |
| `createdAt`   | Date            | When the job was created                                                     |
| `updatedAt`   | Date            | Last time the job document was modified                                      |
| `completedAt` | Date\|null      | Set when job reaches `done` or `error`                                       |
