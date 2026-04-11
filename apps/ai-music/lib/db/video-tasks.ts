/**
 * Music video (MP4) generation tasks collection.
 *
 * Corresponds to POST /api/v1/mp4/generate and
 * GET /api/v1/mp4/record-info.
 *
 * Generates a music video for a Suno-generated audio track.
 */

import type { Collection, WithId } from 'mongodb';
import { getDatabase } from '@/lib/db/connection';

/* ------------------------------------------------------------------ */
/*  Document schema                                                    */
/* ------------------------------------------------------------------ */

export type VideoTaskSuccessFlag =
  | 'PENDING'
  | 'SUCCESS'
  | 'CREATE_TASK_FAILED'
  | 'GENERATE_MP4_FAILED'
  | 'CALLBACK_EXCEPTION';

export interface VideoTaskDocument {
  /** Task ID returned by the Suno API. */
  taskId: string;
  /** Source audio ID to generate video for. */
  musicId: string;
  /** Index of the audio clip within the source task (0-based). */
  musicIndex?: number | null;
  callbackUrl?: string | null;
  author?: string | null;
  domainName?: string | null;
  /** URL of the generated MP4 video. */
  videoUrl?: string | null;
  successFlag: VideoTaskSuccessFlag;
  completeTime?: Date | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Collection helper                                                  */
/* ------------------------------------------------------------------ */

const COLLECTION = 'video_tasks';

let indexesEnsured = false;

async function getCollection(): Promise<Collection<VideoTaskDocument>> {
  const db = await getDatabase();
  const col = db.collection<VideoTaskDocument>(COLLECTION);

  if (!indexesEnsured) {
    await col.createIndexes([
      { key: { taskId: 1 }, unique: true },
      { key: { musicId: 1 } },
      { key: { successFlag: 1 } },
      { key: { createdAt: -1 } },
    ]);
    indexesEnsured = true;
  }

  return col;
}

/* ------------------------------------------------------------------ */
/*  CRUD helpers                                                       */
/* ------------------------------------------------------------------ */

export async function createVideoTask(
  data: Pick<VideoTaskDocument, 'taskId' | 'musicId'> &
    Partial<Omit<VideoTaskDocument, 'taskId' | 'musicId' | 'createdAt' | 'updatedAt'>>,
): Promise<WithId<VideoTaskDocument>> {
  const col = await getCollection();
  const now = new Date();
  const doc: VideoTaskDocument = {
    successFlag: 'PENDING',
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getVideoTaskByTaskId(
  taskId: string,
): Promise<WithId<VideoTaskDocument> | null> {
  const col = await getCollection();
  return col.findOne({ taskId });
}

export async function getVideoTasksByMusicId(
  musicId: string,
): Promise<WithId<VideoTaskDocument>[]> {
  const col = await getCollection();
  return col.find({ musicId }).sort({ createdAt: -1 }).toArray();
}

export async function getAllVideoTasks(
  limit = 500,
  skip = 0,
): Promise<WithId<VideoTaskDocument>[]> {
  const col = await getCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function updateVideoTask(
  taskId: string,
  patch: Partial<VideoTaskDocument>,
): Promise<void> {
  const col = await getCollection();
  await col.updateOne(
    { taskId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deleteVideoTask(taskId: string): Promise<void> {
  const col = await getCollection();
  await col.deleteOne({ taskId });
}
