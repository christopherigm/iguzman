export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Messages sent FROM the main thread TO the edge inference worker. */
export type EdgeWorkerInbound =
  | { type: 'LOAD'; modelId: string; device: 'webgpu' | 'wasm' }
  | {
      type: 'GENERATE';
      id: string;
      messages: ChatMessage[];
      maxNewTokens?: number;
    }
  | { type: 'ABORT'; id: string };

/** Messages sent FROM the edge inference worker TO the main thread. */
export type EdgeWorkerOutbound =
  | { type: 'LOAD_PROGRESS'; progress: number; file?: string }
  | { type: 'LOAD_DONE'; device: 'webgpu' | 'wasm' }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'GENERATE_TOKEN'; id: string; token: string }
  | { type: 'GENERATE_DONE'; id: string; text: string }
  | { type: 'GENERATE_ERROR'; id: string; error: string };
