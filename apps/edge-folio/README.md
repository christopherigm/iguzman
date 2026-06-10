# EdgeFolio

A privacy-first career application platform for software engineers. Analyzes proprietary codebases locally — without violating NDAs — and generates hyper-targeted, ATS-friendly resumes using a hybrid edge + cloud architecture.

## How it works

- **Immutable Matrix** — A user-curated database of 50-100 factual, pre-approved bullet points stored in Postgres. No hallucination: the LLM routes and ranks, never invents.
- **Zero-trust codebase extraction** — A quantized model (Gemma 4b) runs entirely in the browser via WebGPU + OPFS. Proprietary code never leaves the device; only sanitized metadata (stack names, metrics, patterns) is sent to the server.
- **PWA background download** — The service worker silently fetches and caches model weights into the Origin Private File System during onboarding, so the extraction feature is ready when the user needs it.
- **Dynamic assembly** — When applying to a role, the cloud LLM scores and reorders Immutable Matrix bullets to match the job description.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js PWA, next-intl, TanStack Query |
| Edge AI | Transformers.js, WebGPU, OPFS |
| Backend | Django REST Framework |
| Database | PostgreSQL, Redis |
| Infrastructure | Kubernetes (MicroK8s), Helm |

## Running locally

```bash
pnpm dev --filter=edge-folio
```

The Django API must be running on port 8000. Create `.env.local` from `env.example` and set:

```
API_URL=http://localhost:8000
```

## WebGPU on Linux

WebGPU is required for on-device inference. On Linux it is disabled by default even on supported hardware (Chrome/Edge 113+, NVIDIA/AMD GPUs).

**To enable it:**

1. Open `edge://flags/#enable-unsafe-webgpu` (or `chrome://flags/#enable-unsafe-webgpu` in Chrome)
2. Set the flag to **Enabled**
3. Relaunch the browser

**Verify it works** — open DevTools on the extract page and run:

```js
await navigator.gpu.requestAdapter()
// Should return a GPUAdapter object, not null
```

**If the adapter is still null**, launch Edge with explicit Vulkan flags:

```bash
microsoft-edge --enable-features=Vulkan,UseSkiaRenderer --use-angle=vulkan
```

Confirm Vulkan is available on your system:

```bash
vulkaninfo --summary 2>/dev/null | grep -E "GPU|deviceName"
# Install with: sudo apt install vulkan-tools
```

And that the NVIDIA Vulkan ICD is registered:

```bash
ls /usr/share/vulkan/icd.d/ | grep nvidia
# Expected: nvidia_icd.json
```
