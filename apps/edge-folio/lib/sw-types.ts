// Shared types for service-worker ↔ page messaging.
// Import these in page/worker code; the SW file also imports them.

/** Messages sent FROM the page/web-worker TO the service worker. */
export type SwInboundMessage =
  | {
      type: 'FETCH_MODEL_TO_OPFS';
      /** HuggingFace model id, e.g. "google/gemma-3-4b-it" */
      modelId: string;
      /** Relative file paths within the model repo, e.g. ["config.json", "onnx/model_q4.onnx"] */
      files: string[];
      /** Branch / tag / commit hash — defaults to "main" */
      revision?: string;
    }
  | {
      type: 'CHECK_MODEL_CACHED';
      modelId: string;
      files: string[];
    }
  | { type: 'CANCEL_MODEL_FETCH' };

/** Messages sent FROM the service worker TO the page/web-worker. */
export type SwOutboundMessage =
  | { type: 'MODEL_FETCH_START'; modelId: string; fileCount: number }
  | {
      type: 'MODEL_FETCH_FILE_DONE';
      modelId: string;
      file: string;
      fileIndex: number;
      fileCount: number;
      /** true when the file was already in OPFS and was skipped */
      skipped: boolean;
    }
  | {
      type: 'MODEL_FETCH_BYTES';
      modelId: string;
      file: string;
      bytesLoaded: number;
      /** 0 when the server did not send Content-Length */
      bytesTotal: number;
    }
  | { type: 'MODEL_FETCH_COMPLETE'; modelId: string }
  | { type: 'MODEL_FETCH_CANCELLED'; modelId: string }
  | { type: 'MODEL_FETCH_ERROR'; modelId: string; error: string }
  | {
      type: 'MODEL_CACHE_STATUS';
      modelId: string;
      /** Map of file path → whether it exists in OPFS */
      cached: Record<string, boolean>;
    };
