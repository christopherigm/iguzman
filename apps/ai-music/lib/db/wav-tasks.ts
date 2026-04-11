/**
 * WAV conversion tasks collection.
 *
 * Corresponds to POST /api/v1/wav/generate (Generate WAV) and
 * GET /api/v1/wav/record-info (Query WAV Result).
 *
 * Converts a Suno-generated audio track to lossless WAV format.
 */

import type { Collection, WithId } from 'mongodb';
import { getDatabase } from '@/lib/db/connection';

/* ------------------------------------------------------------------ */
/*  Document schema                                                    */
/* ------------------------------------------------------------------ */

export type WavTaskSuccessFlag =
  | 'PENDING'
  | 'SUCCESS'
  | 'CREATE_TASK_FAILED'
  | 'GENERATE_WAV_FAILED'
  | 'CALLBACK_EXCEPTION';

export interface WavTaskDocument {
  /** Task ID returned by the Suno API. */
  taskId: string;
  /** Source audio ID to convert. */
  musicId: string;
  /** Index of the audio clip within the source task (0-based). */
  musicIndex?: number | null;
  callbackUrl?: string | null;
  /** URL of the generated WAV file. */
  audioWavUrl?: string | null;
  successFlag: WavTaskSuccessFlag;
  completeTime?: Date | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Collection helper                                                  */
/* ------------------------------------------------------------------ */

const COLLECTION = 'wav_tasks';

let indexesEnsured = false;

async function getCollection(): Promise<Collection<WavTaskDocument>> {
  const db = await getDatabase();
  const col = db.collection<WavTaskDocument>(COLLECTION);

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

export async function createWavTask(
  data: Pick<WavTaskDocument, 'taskId' | 'musicId'> &
    Partial<Omit<WavTaskDocument, 'taskId' | 'musicId' | 'createdAt' | 'updatedAt'>>,
): Promise<WithId<WavTaskDocument>> {
  const col = await getCollection();
  const now = new Date();
  const doc: WavTaskDocument = {
    successFlag: 'PENDING',
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getWavTaskByTaskId(
  taskId: string,
): Promise<WithId<WavTaskDocument> | null> {
  const col = await getCollection();
  return col.findOne({ taskId });
}

export async function getWavTasksByMusicId(
  musicId: string,
): Promise<WithId<WavTaskDocument>[]> {
  const col = await getCollection();
  return col.find({ musicId }).sort({ createdAt: -1 }).toArray();
}

export async function getAllWavTasks(
  limit = 500,
  skip = 0,
): Promise<WithId<WavTaskDocument>[]> {
  const col = await getCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function updateWavTask(
  taskId: string,
  patch: Partial<WavTaskDocument>,
): Promise<void> {
  const col = await getCollection();
  await col.updateOne(
    { taskId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deleteWavTask(taskId: string): Promise<void> {
  const col = await getCollection();
  await col.deleteOne({ taskId });
}
