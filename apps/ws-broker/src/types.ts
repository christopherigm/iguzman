import type { ObjectId } from 'mongodb';

export type WsOp =
  | 'interpolateFps'
  | 'removeBlackBars'
  | 'convertToH264'
  | 'burnSubtitles';

export interface WsJobParams {
  taskId: string;
  inputFile: string;
  fps?: number;
  subtitlesFile?: string;
}

// Server → client
export type ServerMessage =
  | { type: 'ack' }
  | { type: 'pong' }
  | { type: 'job'; jobId: string; op: WsOp; params: WsJobParams };

// Client → server
export type ClientMessage =
  | { type: 'auth'; uuid: string }
  | { type: 'ping' }
  | { type: 'progress'; jobId: string; percent: number }
  | { type: 'done'; jobId: string; outputFile: string }
  | { type: 'error'; jobId: string; error: string };

export interface WsClientDoc {
  _id?: ObjectId;
  uuid: string;
  label: string;
  registeredAt: Date;
  lastConnectedAt: Date | null;
  lastSeenAt: Date | null;
}

export type JobStatus = 'pending' | 'dispatched' | 'processing' | 'done' | 'error';

export interface ProcessingJobDoc {
  _id?: ObjectId;
  jobId: string;
  clientUuid: string;
  op: WsOp;
  params: WsJobParams;
  status: JobStatus;
  progress: number;
  outputFile: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
