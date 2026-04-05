import { ObjectId, type Collection, type WithId } from 'mongodb';
import { connectToDatabase } from '@repo/helpers/mongo-db';
import type { DownloadVideoResult } from '@repo/helpers/download-video';
import type {
  TaskStatus,
  VideoDownloadInput,
  VideoResultFields,
  DownloadVideoError,
} from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

/* ── Document schema ──────────────────────────────── */

export type { TaskStatus };

export interface VideoTaskDocument
  extends VideoDownloadInput, VideoResultFields {
  status: TaskStatus;
  result: DownloadVideoResult | null;
  error: DownloadVideoError | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ── Constants ────────────────────────────────────── */

const DB_NAME = 'videos';
const COLLECTION_NAME = 'tasks';
const MONGO_URI = IS_PRODUCTION
  ? (process.env.MONGO_URI ??
    'mongodb://mongodb.video-downloader-2.svc.cluster.local:27017')
  : 'mongodb://127.0.0.1:27017';

/* ── Helpers ──────────────────────────────────────── */

/** Guard so index creation runs at most once per process lifetime. */
let indexesEnsured = false;

async function getTasksCollection(): Promise<Collection<VideoTaskDocument>> {
  const db = await connectToDatabase(DB_NAME, MONGO_URI);
  const col = db.collection<VideoTaskDocument>(COLLECTION_NAME);

  if (!indexesEnsured) {
    await col.createIndexes([
      { key: { createdAt: -1 } },
      { key: { file: 1 }, sparse: true },
      { key: { status: 1 } },
      { key: { url: 1, status: 1 } },
    ]);
    indexesEnsured = true;
  }

  return col;
}

export async function createTask(
  params: VideoDownloadInput,
): Promise<WithId<VideoTaskDocument>> {
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
    sourceFps: null,
    width: null,
    height: null,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getAllTasks(
  limit = 500,
  skip = 0,
): Promise<WithId<VideoTaskDocument>[]> {
  const col = await getTasksCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function getTaskCount(): Promise<number> {
  const col = await getTasksCollection();
  return col.countDocuments();
}

export async function findActiveTaskByUrl(
  url: string,
): Promise<WithId<VideoTaskDocument> | null> {
  const col = await getTasksCollection();
  return col.findOne({ url, status: { $in: ['pending', 'downloading'] } });
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
