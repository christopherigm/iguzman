# Diarization Service

A lightweight Python microservice that performs **speaker diarization** and **speaker-attributed transcription** on uploaded audio files.

| Technology | Role |
|---|---|
| [pyannote.audio 3.x](https://github.com/pyannote/pyannote-audio) | Speaker diarization (who spoke when) |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Transcription (what was said), ~4× faster than original Whisper on CPU via CTranslate2 |
| [ffmpeg](https://ffmpeg.org/) | Audio normalization — converts any input to 16 kHz mono WAV before diarization |
| [FastAPI](https://fastapi.tiangolo.com/) | HTTP API |
| [uvicorn](https://www.uvicorn.org/) | ASGI server |

All models are loaded once at startup and reused across requests.
This service is CPU-only — no GPU required.

The Docker image uses a **multi-stage build**: models are downloaded into the image at build time (`HF_TOKEN` is a build arg) and the runtime stage runs fully offline (`HF_HUB_OFFLINE=1`). `HF_TOKEN` is **not** required at container runtime.

---

## API

Authentication: every request (except `/health`) must include the `X-API-Key` header.

### `GET /health`
Returns `{"status": "ok"}`. Used by Kubernetes health probes.

---

### `POST /diarize`
Speaker diarization without transcription.

**Request** — `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | audio file | ✅ | wav, mp3, mp4, m4a, flac, ogg, webm. Max 100 MB. |
| `num_speakers` | int | | Exact number of speakers (improves accuracy when known) |
| `min_speakers` | int | | Minimum number of speakers |
| `max_speakers` | int | | Maximum number of speakers |

**Response**
```json
{
  "segments": [
    { "speaker": "SPEAKER_00", "start": 0.531, "end": 4.218 },
    { "speaker": "SPEAKER_01", "start": 4.780, "end": 9.132 }
  ]
}
```

**Example**
```bash
curl -X POST https://diarization.iguzman.com.mx/diarize \
  -H "X-API-Key: $API_KEY" \
  -F "file=@meeting.mp3" \
  -F "max_speakers=3"
```

---

### `POST /transcribe`
Speaker-attributed transcription — runs both diarization and Whisper, then merges results by temporal overlap.

**Request** — `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | audio file | ✅ | Same formats as `/diarize` |
| `language` | string | | BCP-47 code (e.g. `en`, `es`). Auto-detected if omitted. |
| `num_speakers` | int | | Exact number of speakers |
| `min_speakers` | int | | Minimum number of speakers |
| `max_speakers` | int | | Maximum number of speakers |

**Response**
```json
{
  "language": "en",
  "segments": [
    { "speaker": "SPEAKER_00", "start": 0.531, "end": 4.218, "text": "Hello, how are you?", "language": "en" },
    { "speaker": "SPEAKER_01", "start": 4.780, "end": 9.132, "text": "I'm doing great, thanks!" }
  ]
}
```
> `language` appears only on the first segment (Whisper's auto-detection result).

**Example**
```bash
curl -X POST https://diarization.iguzman.com.mx/transcribe \
  -H "X-API-Key: $API_KEY" \
  -F "file=@interview.wav" \
  -F "language=en" \
  -F "num_speakers=2"
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | HTTP server port |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `API_KEY` | *(empty)* | Authentication key. Leave empty to disable auth (dev only). |
| `HF_TOKEN` | — | HuggingFace access token for pyannote gated models. **Required for local dev** (models downloaded on first run). Not needed at Docker runtime — the image is built with models baked in. |
| `WHISPER_MODEL_SIZE` | `base` | Whisper model size: `tiny`, `base`, `small`, `medium`, `large-v2`, `large-v3`. Larger = more accurate but slower. |

---

## Local Development

### Prerequisites

- Python 3.11+
- `ffmpeg` installed system-wide (`brew install ffmpeg` / `apt install ffmpeg`)
- A HuggingFace account with the pyannote models approved (see below)

### 1. Accept pyannote model terms

Visit both pages and click **Agree**:
- https://huggingface.co/pyannote/speaker-diarization-3.1
- https://huggingface.co/pyannote/segmentation-3.0

Then generate an access token at https://huggingface.co/settings/tokens.

### 2. Set up environment

```bash
cd apps/diarization
cp env.example .env
# Fill in HF_TOKEN and API_KEY in .env
```

### 3. Create a virtual environment and install dependencies

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# Install CPU-only PyTorch (avoids pulling ~2 GB CUDA wheels)
pip install torch==2.4.1 torchaudio==2.4.1 --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
pip install -r requirements.txt
```

### 4. Run the server

```bash
# Load env vars and start with auto-reload
cd src
export $(grep -v '^#' ../.env | xargs)
uvicorn main:app --reload --port 8000
```

The interactive API docs are available at http://localhost:8000/docs.

> **First run:** pyannote and Whisper models (~2-4 GB) are downloaded from HuggingFace and cached in `~/.cache/huggingface`. Subsequent starts are instant.

---

## Docker

The Dockerfile uses a **multi-stage build**:

1. **`model-downloader` stage** — installs dependencies and downloads pyannote + Whisper models into the HuggingFace cache. Requires `HF_TOKEN` as a build arg; the token is never written to the final image.
2. **Runtime stage** — copies the model cache from stage 1 and sets `HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1` so the container never makes network requests to HuggingFace.

### Build

```bash
# From repo root
docker build \
  --build-arg HF_TOKEN=hf_your_token \
  --build-arg WHISPER_MODEL_SIZE=base \
  -t christopherguzman/diarization:latest \
  apps/diarization/
```

Or with the monorepo deploy script:
```bash
pnpm docker --filter=diarization
```

### Run locally

```bash
docker run --rm -p 8000:8000 \
  -e API_KEY=your-key \
  christopherguzman/diarization:latest
```

`HF_TOKEN` is not required at runtime — models are already baked into the image.

---

## Deployment (Kubernetes / Helm)

### 1. Create the Kubernetes secret

```bash
kubectl create secret generic diarization-secrets \
  --from-literal=API_KEY='your-strong-api-key' \
  -n diarization
```

> `HF_TOKEN` is only required in the secret when `modelsBaked: false` (models downloaded at pod startup). The default (`modelsBaked: true`) does not inject `HF_TOKEN` at runtime.

### 2. Install the Helm chart

```bash
# First time
helm install diarization apps/diarization/helm/ -n diarization --create-namespace

# Upgrades
helm upgrade diarization apps/diarization/helm/ -n diarization
```

### 3. Key Helm values

| Value | Default | Description |
|---|---|---|
| `modelsBaked` | `true` | Set to `true` when the image was built with baked-in models (multi-stage Dockerfile). Controls startup probe timeout and whether `HF_TOKEN` is injected. |
| `modelCache.enabled` | `false` | Mount a PVC at `/root/.cache/huggingface`. Useful when `modelsBaked: false` to avoid re-downloading models on every pod restart. |
| `modelCache.size` | `5Gi` | PVC size. |
| `nodeAffinity.nodeNames` | `[node6]` | Pin the pod to a specific node (CPU-intensive workload). |

To deploy **without** baked models (downloads on first boot):

```bash
kubectl create secret generic diarization-secrets \
  --from-literal=API_KEY='your-strong-api-key' \
  --from-literal=HF_TOKEN='hf_your_token' \
  -n diarization

helm upgrade diarization apps/diarization/helm/ -n diarization \
  --set modelsBaked=false \
  --set modelCache.enabled=true \
  --set modelCache.size=5Gi
```

### 4. Useful commands

```bash
# Pod status
kubectl get pods -n diarization

# Tail logs (shows model load progress on startup)
kubectl logs -n diarization -l app.kubernetes.io/name=diarization -f

# Describe pod (useful if stuck in CrashLoopBackOff)
kubectl describe pod -n diarization -l app.kubernetes.io/name=diarization
```

### Notes

- **Cold-start time:** With `modelsBaked: true` (default), models load from the image cache — startup probe allows **2 minutes**. With `modelsBaked: false`, pyannote + Whisper are downloaded on first boot (5-10 min); startup probe allows **15 minutes**.
- **CPU performance:** Processing time scales roughly linearly with audio duration. Expect ~1-3× real-time on a Core i9 (e.g. a 10-minute recording takes 10-30 minutes to fully process). Providing `num_speakers` when known significantly speeds up diarization.
- **Timeouts:** The ingress is configured with a 600-second proxy timeout. For very long files, consider splitting audio client-side before uploading.
- **Single replica:** Keep `replicaCount: 1`. Models are held in-process memory and the service is not designed to scale horizontally.
