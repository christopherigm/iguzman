import { pipeline, env, TextStreamer } from '@huggingface/transformers';
import type { EdgeWorkerInbound, EdgeWorkerOutbound } from './edge-worker-types';

// ─── OPFS fetch interceptor ───────────────────────────────────────────────────
// Intercepts HuggingFace model URL fetches and serves files from OPFS instead
// of the network. Non-HF requests (e.g. ONNX runtime WASM) fall through to
// the native fetch so the worker can still load the inference runtime.

const HF_MODEL_RE = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/[^/]+\/(.+)/;

function mimeType(filename: string): string {
  if (filename.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

async function readFromOPFS(modelId: string, relativePath: string): Promise<Response | null> {
  try {
    const root = await navigator.storage.getDirectory();
    // Mirror the path written by the service worker:
    // models/{owner}/{repo}/{relativePath}
    const segments = ['models', ...modelId.split('/'), ...relativePath.split('/')];
    const filename = segments.pop()!;
    let dir: FileSystemDirectoryHandle = root;
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg);
    }
    const fileHandle = await dir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type': mimeType(filename),
        'content-length': String(buffer.byteLength),
      },
    });
  } catch {
    return null;
  }
}

const nativeFetch = self.fetch.bind(self);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = input instanceof Request ? input.url : String(input);
  const match = url.match(HF_MODEL_RE);
  if (match && match[1] && match[2]) {
    const opfsResp = await readFromOPFS(match[1], match[2]);
    if (opfsResp) return opfsResp;
    // File not cached — refuse to go to network (privacy guarantee)
    return new Response(null, {
      status: 404,
      statusText: `Model file not in local cache: ${match[2]}`,
    });
  }
  return nativeFetch(input, init);
};

// ─── Transformers.js configuration ───────────────────────────────────────────

env.allowLocalModels = false;
// Disable Cache Storage API — OPFS is the sole source of truth for model files
env.useBrowserCache = false;

// ─── Worker state ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipe: any = null;
let loadedKey = '';

function send(msg: EdgeWorkerOutbound): void {
  self.postMessage(msg);
}

// ─── LOAD handler ─────────────────────────────────────────────────────────────

async function handleLoad(msg: Extract<EdgeWorkerInbound, { type: 'LOAD' }>): Promise<void> {
  const key = `${msg.modelId}:${msg.device}`;
  if (pipe && loadedKey === key) {
    send({ type: 'LOAD_DONE', device: msg.device });
    return;
  }

  pipe = null;
  loadedKey = '';

  try {
    pipe = await pipeline('text-generation', msg.modelId, {
      device: msg.device,
      progress_callback: (info: { status: string; progress?: number; file?: string }) => {
        if (info.status === 'progress' && info.progress !== undefined) {
          send({ type: 'LOAD_PROGRESS', progress: Math.round(info.progress), file: info.file });
        }
      },
    });
    loadedKey = key;
    send({ type: 'LOAD_DONE', device: msg.device });
  } catch (err) {
    send({ type: 'LOAD_ERROR', error: err instanceof Error ? err.message : String(err) });
  }
}

// ─── GENERATE handler ─────────────────────────────────────────────────────────

async function handleGenerate(msg: Extract<EdgeWorkerInbound, { type: 'GENERATE' }>): Promise<void> {
  if (!pipe) {
    send({ type: 'GENERATE_ERROR', id: msg.id, error: 'Engine not loaded' });
    return;
  }

  let generated = '';

  const streamer = new TextStreamer(pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (token: string) => {
      generated += token;
      send({ type: 'GENERATE_TOKEN', id: msg.id, token });
    },
  });

  try {
    await pipe(msg.messages, {
      max_new_tokens: msg.maxNewTokens ?? 512,
      do_sample: false,
      streamer,
    });
    send({ type: 'GENERATE_DONE', id: msg.id, text: generated });
  } catch (err) {
    send({ type: 'GENERATE_ERROR', id: msg.id, error: err instanceof Error ? err.message : String(err) });
  }
}

// ─── Message router ───────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<EdgeWorkerInbound>) => {
  const msg = event.data;
  if (!msg?.type) return;

  switch (msg.type) {
    case 'LOAD':
      void handleLoad(msg);
      break;
    case 'GENERATE':
      void handleGenerate(msg);
      break;
    case 'ABORT':
      // Generation is synchronous in the current ONNX runtime; abort is a
      // no-op here but the message type is reserved for future cancellation.
      break;
  }
};
