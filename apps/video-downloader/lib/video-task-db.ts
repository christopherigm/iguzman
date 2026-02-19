import { ObjectId, type Collection, type WithId } from 'mongodb';
import { connectToDatabase } from '@repo/helpers/mongo-db';
import type {
  DownloadVideoResult,
  DownloadVideoError,
} from '@repo/helpers/download-video';

/* ── Document schema ──────────────────────────────── */

export type TaskStatus = 'pending' | 'downloading' | 'done' | 'error';

export interface VideoTaskDocument {
  url: string;
  justAudio: boolean;
  checkCodec: boolean;
  status: TaskStatus;
  result: DownloadVideoResult | null;
  error: DownloadVideoError | null;
  file: string | null;
  name: string | null;
  isH265: boolean | null;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ── Constants ────────────────────────────────────── */

const DB_NAME = 'videos';
const COLLECTION_NAME = 'tasks';
const MONGO_URI =
  process.env.MONGO_URI ??
  'mongodb://mongodb.video-downloader-2.svc.cluster.local:27017';

/* ── Helpers ──────────────────────────────────────── */

async function getTasksCollection(): Promise<
  Collection<VideoTaskDocument>
> {
  const db = await connectToDatabase(DB_NAME, MONGO_URI);
  return db.collection<VideoTaskDocument>(COLLECTION_NAME);
}

export async function createTask(params: {
  url: string;
  justAudio: boolean;
  checkCodec: boolean;
}): Promise<WithId<VideoTaskDocument>> {
  const col = await getTasksCollection();
  const now = new Date();
  const doc: VideoTaskDocument = {
    url: params.url,
    justAudio: params.justAudio,
    checkCodec: params.checkCodec,
    status: 'pending',
    result: null,
    error: null,
    file: null,
    name: null,
    isH265: null,
    thumbnail: null,
    duration: null,
    uploader: null,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getTask(
  id: string,
): Promise<WithId<VideoTaskDocument> | null> {
  const col = await getTasksCollection();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function updateTask(
  id: string,
  patch: Partial<VideoTaskDocument>,
): Promise<void> {
  const col = await getTasksCollection();
  await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function updateTaskByFile(
  fileName: string,
  patch: Partial<VideoTaskDocument>,
): Promise<void> {
  const col = await getTasksCollection();
  await col.updateOne(
    { file: fileName },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deleteTask(id: string): Promise<void> {
  const col = await getTasksCollection();
  await col.deleteOne({ _id: new ObjectId(id) });
}
