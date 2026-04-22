import type { Collection, WithId } from 'mongodb';
import { connectToDatabase } from '@repo/helpers/mongo-db';

const DB_NAME = 'videos';
const IS_PROD = process.env.NODE_ENV?.trim() === 'production';
const MONGO_URI = IS_PROD
  ? (process.env.MONGO_URI ?? 'mongodb://mongodb.video-downloader-2.svc.cluster.local:27017')
  : 'mongodb://127.0.0.1:27017';

export type ProcessingOp = 'interpolateFps' | 'removeBlackBars' | 'convertToH264' | 'burnSubtitles';
export type JobStatus = 'pending' | 'dispatched' | 'processing' | 'done' | 'error';

export interface ProcessingJobDocument {
  jobId: string;
  clientUuid: string;
  taskId: string;
  op: ProcessingOp;
  params: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  outputFile: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

let col: Collection<ProcessingJobDocument> | null = null;

async function getCol(): Promise<Collection<ProcessingJobDocument>> {
  if (!col) {
    const db = await connectToDatabase(DB_NAME, MONGO_URI);
    col = db.collection<ProcessingJobDocument>('processing_jobs');
    await col.createIndex({ jobId: 1 }, { unique: true });
    await col.createIndex({ taskId: 1 });
    await col.createIndex({ createdAt: -1 });
  }
  return col;
}

export async function createProcessingJob(
  doc: Omit<ProcessingJobDocument, 'createdAt' | 'updatedAt' | 'completedAt'>,
): Promise<WithId<ProcessingJobDocument>> {
  const c = await getCol();
  const now = new Date();
  const full: ProcessingJobDocument = { ...doc, createdAt: now, updatedAt: now, completedAt: null };
  await c.insertOne(full as WithId<ProcessingJobDocument>);
  return (await c.findOne({ jobId: doc.jobId })) as WithId<ProcessingJobDocument>;
}

export async function getProcessingJob(jobId: string): Promise<WithId<ProcessingJobDocument> | null> {
  const c = await getCol();
  return c.findOne({ jobId });
}

export async function updateProcessingJob(
  jobId: string,
  patch: Partial<ProcessingJobDocument>,
): Promise<void> {
  const c = await getCol();
  await c.updateOne({ jobId }, { $set: { ...patch, updatedAt: new Date() } });
}
