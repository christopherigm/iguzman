# video-downloader

A Next.js application for downloading and client-side processing of videos using FFmpeg WASM. Videos are downloaded server-side via `yt-dlp` / `gallery-dl`, stored on a shared volume, and processed in the browser using a multi-threaded FFmpeg Web Worker.

---

## Table of Contents

- [Architecture overview](#architecture-overview)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Infrastructure prerequisites](#infrastructure-prerequisites)
  - [MetalLB (MicroK8s)](#metallb-microk8s)
  - [MongoDB](#mongodb)
- [Deployment](#deployment)
  - [First-time setup](#first-time-setup)
  - [Full deploy (build + push + Helm)](#full-deploy-build--push--helm)
  - [Helm-only redeploy](#helm-only-redeploy)
- [Helm values reference](#helm-values-reference)
- [Health probes](#health-probes)
- [nginx-media (HTTP/3 video streaming)](#nginx-media-http3-video-streaming)

---

## Architecture overview

```
Browser
  │
  ├── HTTPS 443  ──► Ingress (nginx-ingress, MicroK8s)
  │                      ├── /api/media/ PUT ──► Next.js :3000   (upload processed video)
  │                      └── /*           ──► Next.js :3000   (app, API routes)
  │
  └── HTTPS 8443 ──► MetalLB LoadBalancer ──► nginx-media pod :8443  (HTTP/3 + HTTP/2)
                                                   └── hostPath /shared-master/<ns>/media
                                                       (Samba share, mounted on every node)
```

- **Next.js** handles all app routes, the download API, and `PUT /api/media/:filename` for uploading FFmpeg-processed blobs back to disk.
- **nginx-media** is a standalone pod (`nginx:1.27-alpine`) that serves `GET /api/media/*` with HTTP/3 (QUIC) and HTTP/2, exposed directly via a MetalLB LoadBalancer on port 8443.
- **Shared storage** is a Samba share mounted identically on every cluster node at `/shared-master/<namespace>/media`, so all pods see the same files without an NFS PVC.
- **FFmpeg WASM** runs in the browser in a dedicated Web Worker. It requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers (set in `next.config.js`). Videos served from the `nginx-media` subdomain include `Cross-Origin-Resource-Policy: cross-origin` so the browser allows cross-origin loading under COEP.

---

## Environment variables

All variables live in `apps/video-downloader/.env`. Copy `env.example` to get started:

```bash
cp apps/video-downloader/env.example apps/video-downloader/.env
```

| Variable | Required | Description |
|---|---|---|
| `DOCKER_REGISTRY` | Yes | Docker Hub username or registry host (e.g. `christopherguzman`). Used by `pnpm docker video-downloader` to tag and push. |
| `NAMESPACE` | Yes | Kubernetes namespace to deploy into (e.g. `video-downloader-2`). Used as the default by `pnpm helm video-downloader`. |
| `MONGO_URI` | Yes (runtime) | MongoDB connection string injected at runtime via Kubernetes env. E.g. `mongodb://mongodb.video-downloader-2.svc.cluster.local:27017`. Set this in `helm/values.yaml` under `env` or `envFromSecret`. |
| `NEXT_PUBLIC_MEDIA_HOST` | Yes (build-time) | Host (and port) of the nginx-media service, e.g. `media.vd2.iguzman.com.mx:8443`. **Baked into the JS bundle at build time** by `pnpm docker video-downloader` — changing it requires a rebuild. |
| `IMAGE_TAG` | No | Overrides the default image tag in `pnpm helm video-downloader` (defaults to `package.json` version). |
| `REPLICA_COUNT` | No | Overrides `replicaCount` in `pnpm helm video-downloader`. |

### How `NEXT_PUBLIC_MEDIA_HOST` is baked in

`NEXT_PUBLIC_*` variables are inlined into the client-side JavaScript bundle by `next build`. They are **not** read from Kubernetes env vars at runtime. The `scripts/docker-build.mjs` script reads all `NEXT_PUBLIC_*` entries from `.env` and passes them as `--build-arg` to `docker build`, which sets them as `ENV` in the builder stage before `next build` runs.

```
.env  ──► docker-build.mjs ──► --build-arg NEXT_PUBLIC_MEDIA_HOST=… ──► next build (baked in)
```

---

## Local development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start the app in dev mode
pnpm dev --filter=apps/video-downloader

# Type-check
pnpm check-types

# Lint
pnpm lint
```

The dev server runs on `http://localhost:3000`. In development, `resolveVideoUrl` rewrites `/api/media/` to `/media/` (served from `public/media/`) so no nginx-media pod is needed locally.

---

## Infrastructure prerequisites

### MetalLB (MicroK8s)

nginx-media is exposed as a `type: LoadBalancer` service. MetalLB must be enabled and configured with an IP pool before deploying.

**1. Enable the addon**

```bash
microk8s enable metallb
```

When prompted, enter the IP range to allocate from your LAN (must not overlap with DHCP):

```
Enter each IP address range delimited by comma (e.g. '10.64.140.43-10.64.140.49,192.168.0.105-192.168.0.111'):
192.168.0.105-192.168.0.111
```

**2. Verify**

```bash
microk8s kubectl get ipaddresspool -n metallb-system
microk8s kubectl get l2advertisement -n metallb-system
```

If the addon was enabled before the pool was configured, create the pool manually:

```bash
cat <<EOF | microk8s kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.0.105-192.168.0.111
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default
  namespace: metallb-system
spec:
  ipAddressPools:
    - default-pool
EOF
```

**3. Router port forwards required for nginx-media**

| Protocol | External port | Internal IP | Internal port |
|---|---|---|---|
| TCP | 8443 | 192.168.0.105 | 8443 |
| UDP | 8443 | 192.168.0.105 | 8443 |

UDP is required for QUIC (HTTP/3). TCP is the HTTP/2 fallback.

---

### MongoDB

The app stores download task state in MongoDB. Deploy it to the same namespace using the provided script:

```bash
pnpm deploy-mongodb
```

The interactive prompt will ask for:

| Prompt | Example value | Notes |
|---|---|---|
| Namespace | `video-downloader-2` | Must match `NAMESPACE` in `.env` |
| `auth.rootUsername` | `admin` | Leave blank to skip auth |
| `auth.rootPassword` | `s3cr3t` | Leave blank to skip auth |
| `persistence.size` | `5Gi` | PVC size for MongoDB data |

After deployment, the in-cluster connection string is:

```
mongodb://<user>:<password>@mongodb.<namespace>.svc.cluster.local:27017
```

Set this as `MONGO_URI` in `helm/values.yaml` under `env`, or preferably as a Kubernetes Secret referenced via `envFromSecret`:

```yaml
# helm/values.yaml
envFromSecret:
  - name: MONGO_URI
    secretName: video-downloader-secrets
    secretKey: mongo-uri
```

```bash
microk8s kubectl create secret generic video-downloader-secrets \
  --from-literal=mongo-uri='mongodb://admin:s3cr3t@mongodb.video-downloader-2.svc.cluster.local:27017' \
  -n video-downloader-2
```

---

## Deployment

All commands run from the **monorepo root**.

### First-time setup

1. Copy and fill in the env file:
   ```bash
   cp apps/video-downloader/env.example apps/video-downloader/.env
   # Edit .env: set DOCKER_REGISTRY, NAMESPACE, NEXT_PUBLIC_MEDIA_HOST
   ```

2. Review `helm/values.yaml` — set `ingress.hosts`, `nginxMedia.subdomain`, `nginxMedia.service.loadBalancerIP`, and any `env` / `envFromSecret` values.

3. Create DNS records:
   - `vd2.iguzman.com.mx` → your public IP (port 443 forwarded to ingress controller)
   - `media.vd2.iguzman.com.mx` → your public IP (ports 8443 TCP+UDP forwarded to MetalLB IP)

4. Deploy MongoDB (see [MongoDB](#mongodb) above).

### Full deploy (build + push + Helm)

Bumps the patch version, runs `next build`, builds and pushes the Docker image (with all `NEXT_PUBLIC_*` vars baked in), then runs `helm upgrade --install`:

```bash
pnpm deploy-app video-downloader -y
```

The `-y` flag skips all confirmation prompts using defaults from `.env`.

### Helm-only redeploy

When only Helm values have changed (no code changes):

```bash
pnpm helm video-downloader
```

### Docker-only rebuild

When only the image needs rebuilding (e.g. after changing `.env`):

```bash
pnpm docker video-downloader
```

---

## Helm values reference

Key values in `helm/values.yaml`:

| Path | Default | Description |
|---|---|---|
| `replicaCount` | `3` | Next.js pod replicas |
| `image.repository` | `christopherguzman/video-downloader` | Docker image |
| `image.tag` | `latest` | Image tag (overridden by deploy script) |
| `ingress.hosts[0].host` | `vd2.iguzman.com.mx` | Main app hostname |
| `hostPathVolume.volumeMountPath` | `/shared-master` | Samba mount base path on each node |
| `hostPathVolume.mountPath` | `/app/media` | Path inside the container |
| `nginxMedia.enabled` | `true` | Enable the standalone HTTP/3 nginx-media pod |
| `nginxMedia.port` | `8443` | Port nginx-media listens on (and MetalLB exposes) |
| `nginxMedia.subdomain` | `media.vd2.iguzman.com.mx` | Subdomain for the media service and TLS cert |
| `nginxMedia.certIssuer` | `letsencrypt-prod` | cert-manager ClusterIssuer name |
| `nginxMedia.service.type` | `LoadBalancer` | `LoadBalancer` (MetalLB) or `NodePort` |
| `nginxMedia.service.loadBalancerIP` | `192.168.0.105` | Fixed MetalLB IP for the media service |
| `nginxMedia.replicaCount` | `4` | HTTP/2 load-balances fine; QUIC sessions may pin to one pod |
| `env.NEXT_PUBLIC_MEDIA_HOST` | *(commented)* | Do not set here — bake into the image via `.env` |

---

## Health probes

Both the **Next.js app pods** and the **nginx-media pods** use the same file-based startup and liveness probes. This ensures no pod is marked ready until the Samba share is mounted and healthy.

### How it works

A sentinel file `.healthy` is expected to exist at `hostPathVolume.mountPath` (default `/app/media/.healthy`) on the shared Samba volume. Both probe types run:

```bash
test -f /app/media/.healthy
```

| Probe | Behaviour |
|---|---|
| **startupProbe** | Checked every 5 s, up to 30 failures (~150 s total) before the container is killed. Gives pods time to wait for the Samba mount on first boot. |
| **livenessProbe** | Checked every 10 s. If the file disappears (e.g. Samba unmounted), the container is restarted after 3 failures (~30 s). |

### Creating the sentinel file

The file must be created manually once after the Samba share is mounted on the nodes. Run this on the master node (or any node that has the share mounted):

```bash
touch /shared-master/<namespace>/media/.healthy
# e.g.
touch /shared-master/video-downloader-2/media/.healthy
```

All pods in the namespace share the same path, so a single `touch` unblocks every pod regardless of which node it is scheduled on.

### Probe values reference

Configured under `probes` in `helm/values.yaml`:

```yaml
probes:
  healthFile: /app/media/.healthy

  startupProbe:
    exec:
      command: ['test', '-f', '/app/media/.healthy']
    initialDelaySeconds: 5
    periodSeconds: 5
    failureThreshold: 30   # up to ~150 s on first boot

  livenessProbe:
    exec:
      command: ['test', '-f', '/app/media/.healthy']
    initialDelaySeconds: 0
    periodSeconds: 10
    failureThreshold: 3    # restart after ~30 s of missing file
```

To change the path, update `probes.healthFile` **and** both `exec.command` arrays — all three must stay in sync.

---

## nginx-media (HTTP/3 video streaming)

The `nginx-media` Deployment is separate from the Next.js app pod and serves all `GET /api/media/*` requests with HTTP/3 (QUIC) support for lower-latency video streaming in the infinite-scroll player.

**How it works:**

1. On first request the browser connects over HTTP/2 (TCP 8443).
2. nginx responds with `Alt-Svc: h3=":8443"; ma=86400`, advertising HTTP/3.
3. The browser upgrades subsequent requests to QUIC (UDP 8443).

**TLS certificate:**
cert-manager issues a certificate for `nginxMedia.subdomain` via HTTP-01 challenge through the main nginx ingress controller. The DNS for the media subdomain must point to the same public IP as the main app so the ACME challenge is reachable on port 80.

**Volume:**
nginx-media mounts the same `hostPath` as the Next.js pods (`/shared-master/<namespace>/media`). Because the Samba share is mounted identically on every node, all pods see the same files regardless of which node they are scheduled on.

**PUT uploads:**
Client-side FFmpeg blobs are uploaded via `PUT /api/media/:filename` to the **main domain** (`window.location.origin`), which routes through the ingress to the Next.js API route. nginx-media is read-only for GET/HEAD and proxies any other method to the Next.js ClusterIP service.

**Verifying HTTP/3:**

```bash
# Check the Alt-Svc response header
curl -sI https://media.vd2.iguzman.com.mx:8443/healthz | grep -i alt-svc

# Test a media file is reachable
curl -sk https://media.vd2.iguzman.com.mx:8443/healthz
# Expected: ok
```
