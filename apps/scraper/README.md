# scraper

A lightweight headless-browser microservice built with **Fastify** and **Playwright**. It exposes two JSON endpoints — web search and URL content extraction — protected by a shared API key.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Fastify (port 4000)         │
│                                              │
│  POST /search  ──►  search.ts               │
│                       ├─ DuckDuckGo (fetch + │
│                       │  Playwright DOM)     │
│                       └─ Bing (Playwright)   │
│                                              │
│  POST /extract ──►  extract.ts              │
│                       └─ Playwright goto +   │
│                          innerText strip     │
│                                              │
│  GET  /health  ──►  { status: "ok" }        │
│                                              │
│       ▼                                      │
│  browser.ts  (singleton Chromium instance)   │
└─────────────────────────────────────────────┘
```

- **`src/index.ts`** — Fastify server setup, auth hook, route handlers, graceful shutdown.
- **`src/browser.ts`** — Singleton `chromium` instance. Auto-restarts on crash. Passes `--no-sandbox` and `--disable-dev-shm-usage` flags required inside containers.
- **`src/search.ts`** — `searchWeb()` supports DuckDuckGo (CAPTCHA-safe via `fetch` + `setContent`) and Bing (full navigation).
- **`src/extract.ts`** — `extractUrl()` navigates to a page, removes boilerplate elements (`nav`, `footer`, ads, etc.), and returns clean text.

---

## Dependencies

| Package      | Role                         |
| ------------ | ---------------------------- |
| `fastify`    | HTTP server                  |
| `playwright` | Headless Chromium automation |

The Docker image is based on `mcr.microsoft.com/playwright:v1.51.0-noble`, which bundles Chromium and all system dependencies.

---

## Endpoints

All endpoints except `/health` require the `X-API-Key` header.

### `GET /health`

Health check. Returns `200 { "status": "ok" }`. No auth required.

---

### `POST /search`

Run a web search and return structured results.

**Request body**

| Field        | Type                     | Default        | Description              |
| ------------ | ------------------------ | -------------- | ------------------------ |
| `query`      | `string`                 | —              | Search query (required)  |
| `engine`     | `"duckduckgo" \| "bing"` | `"duckduckgo"` | Search engine            |
| `maxResults` | `number`                 | `5`            | Number of results (1–20) |

**Response**

```json
{
  "results": [
    {
      "title": "Example Domain",
      "url": "https://example.com",
      "snippet": "This domain is for use in illustrative examples…"
    }
  ]
}
```

**Example**

```bash
curl -X POST https://scraper.iguzman.com.mx/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{ "query": "playwright headless browser", "engine": "bing", "maxResults": 3 }'
```

---

### `POST /extract`

Extract the readable text content from a URL.

**Request body**

| Field | Type     | Description                                               |
| ----- | -------- | --------------------------------------------------------- |
| `url` | `string` | Full URL starting with `http://` or `https://` (required) |

**Response**

```json
{
  "title": "Page Title",
  "url": "https://example.com/article",
  "content": "Cleaned body text without nav/footer/ads…"
}
```

**Example**

```bash
curl -X POST https://scraper.iguzman.com.mx/extract \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{ "url": "https://example.com" }'
```

---

## Environment Variables

| Variable          | Default   | Description                                                               |
| ----------------- | --------- | ------------------------------------------------------------------------- |
| `PORT`            | `4000`    | Port the server listens on                                                |
| `SCRAPER_API_KEY` | _(empty)_ | API key checked on every request. Leave empty to disable auth (dev only). |
| `LOG_LEVEL`       | `info`    | Fastify log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal`     |
| `NODE_ENV`        | —         | Set to `production` in the container                                      |

---

## Local Development

```bash
# from the repo root
cp apps/scraper/.env.example apps/scraper/.env
# edit .env and set SCRAPER_API_KEY

pnpm dev --filter=apps/scraper
```

The server starts at `http://localhost:4000`.

---

## Docker

```bash
# Build from the repo root (context is the monorepo root)
docker build -f apps/scraper/Dockerfile -t christopherguzman/scraper:latest .

# Run
docker run --rm -p 4000:4000 \
  -e SCRAPER_API_KEY=your-api-key \
  christopherguzman/scraper:latest
```

---

## Deployment (Kubernetes / MicroK8s)

### 1. Create the API key secret

The `SCRAPER_API_KEY` must be stored as a Kubernetes Secret **before** deploying the Helm chart. The chart references it via `envFromSecret`.

```bash
kubectl create secret generic scraper-secrets \
  --namespace=scraper \
  --from-literal=api-key='your-strong-api-key-here'
```

Verify it was created:

```bash
kubectl get secret scraper-secrets -n scraper
```

To rotate the key later, delete and recreate the secret, then restart the deployment:

```bash
kubectl delete secret scraper-secrets -n scraper
kubectl create secret generic scraper-secrets \
  --namespace=scraper \
  --from-literal=api-key='new-api-key'
kubectl rollout restart deployment/scraper -n scraper
```

---

### 2. Configure `values.yaml`

Edit `helm/values.yaml` and set at minimum:

```yaml
image:
  repository: christopherguzman/scraper
  tag: 'latest'

ingress:
  hosts:
    - host: scraper.your-domain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: scraper-tls
      hosts:
        - scraper.your-domain.com

envFromSecret:
  - name: SCRAPER_API_KEY
    secretName: scraper-secrets
    secretKey: api-key
```

---

### 3. Deploy with Helm

```bash
# Install
helm install scraper apps/scraper/helm \
  --namespace scraper \
  --create-namespace

# Upgrade after changes
helm upgrade scraper apps/scraper/helm \
  --namespace scraper

# Uninstall
helm uninstall scraper --namespace scraper
```

---

### Resource Notes

Playwright launches a Chromium process inside the container. The defaults in `values.yaml` allocate **512 Mi request / 1 Gi limit** of memory. Do not set `replicaCount` above `1` without adding a load-balancer session strategy — the singleton browser instance is not shared across pods.
