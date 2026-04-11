/**
 * Lyrics generation tasks collection.
 *
 * Corresponds to POST /api/v1/lyrics (Generate Lyrics) and
 * GET /api/v1/lyrics/record-info (Query Lyrics Result).
 */

import type { Collection, WithId } from 'mongodb';
import { getDatabase } from '@/lib/db/connection';

/* ------------------------------------------------------------------ */
/*  Document schema                                                    */
/* ------------------------------------------------------------------ */

export type LyricsTaskStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'CREATE_TASK_FAILED'
  | 'GENERATE_LYRICS_FAILED'
  | 'CALLBACK_EXCEPTION'
  | 'SENSITIVE_WORD_ERROR';

export interface LyricsDataItem {
  text: string;
  title: string;
  status: 'complete' | 'failed';
  errorMessage: string;
}

export interface LyricsTaskDocument {
  /** Task ID returned by the Suno API. */
  taskId: string;
  /** The theme or subject prompt for the lyrics. */
  prompt: string;
  callBackUrl?: string | null;
  status: LyricsTaskStatus;
  /** Array of generated lyrics results. */
  lyricsData: LyricsDataItem[];
  errorCode?: number | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Collection helper                                                  */
/* ------------------------------------------------------------------ */

const COLLECTION = 'lyrics_tasks';

let indexesEnsured = false;

async function getCollection(): Promise<Collection<LyricsTaskDocument>> {
  const db = await getDatabase();
  const col = db.collection<LyricsTaskDocument>(COLLECTION);

  if (!indexesEnsured) {
    await col.createIndexes([
      { key: { taskId: 1 }, unique: true },
      { key: { status: 1 } },
      { key: { createdAt: -1 } },
    ]);
    indexesEnsured = true;
  }

  return col;
}

/* ------------------------------------------------------------------ */
/*  CRUD helpers                                                       */
/* ------------------------------------------------------------------ */

export async function createLyricsTask(
  data: Omit<LyricsTaskDocument, 'lyricsData' | 'status' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<LyricsTaskDocument, 'lyricsData' | 'status'>>,
): Promise<WithId<LyricsTaskDocument>> {
  const col = await getCollection();
  const now = new Date();
  const doc: LyricsTaskDocument = {
    lyricsData: [],
    status: 'PENDING',
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getLyricsTaskByTaskId(
  taskId: string,
): Promise<WithId<LyricsTaskDocument> | null> {
  const col = await getCollection();
  return col.findOne({ taskId });
}

export async function getAllLyricsTasks(
  limit = 500,
  skip = 0,
): Promise<WithId<LyricsTaskDocument>[]> {
  const col = await getCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function updateLyricsTask(
  taskId: string,
  patch: Partial<LyricsTaskDocument>,
): Promise<void> {
  const col = await getCollection();
  await col.updateOne(
    { taskId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deleteLyricsTask(taskId: string): Promise<void> {
  const col = await getCollection();
  await col.deleteOne({ taskId });
}
