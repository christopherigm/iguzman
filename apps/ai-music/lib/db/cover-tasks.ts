/**
 * Music cover image generation tasks collection.
 *
 * Corresponds to POST /api/v1/suno/cover/generate and
 * GET /api/v1/suno/cover/record-info.
 *
 * Cover tasks have a separate task ID and a different status lifecycle
 * (numeric flag) from music generation tasks.
 */

import type { Collection, WithId } from 'mongodb';
import { getDatabase } from '@/lib/db/connection';

/* ------------------------------------------------------------------ */
/*  Document schema                                                    */
/* ------------------------------------------------------------------ */

/**
 * 0 = Pending
 * 1 = Success
 * 2 = Generating
 * 3 = Generation failed
 */
export type CoverSuccessFlag = 0 | 1 | 2 | 3;

export interface CoverTaskDocument {
  /** Cover task ID returned by POST /api/v1/suno/cover/generate. */
  taskId: string;
  /** Original music generation task ID that triggered this cover. */
  parentTaskId: string;
  callbackUrl?: string | null;
  /** Array of generated cover image URLs (usually 2). */
  images: string[];
  successFlag: CoverSuccessFlag;
  completeTime?: Date | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Collection helper                                                  */
/* ------------------------------------------------------------------ */

const COLLECTION = 'cover_tasks';

let indexesEnsured = false;

async function getCollection(): Promise<Collection<CoverTaskDocument>> {
  const db = await getDatabase();
  const col = db.collection<CoverTaskDocument>(COLLECTION);

  if (!indexesEnsured) {
    await col.createIndexes([
      { key: { taskId: 1 }, unique: true },
      { key: { parentTaskId: 1 } },
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

export async function createCoverTask(
  data: Pick<CoverTaskDocument, 'taskId' | 'parentTaskId'> &
    Partial<Omit<CoverTaskDocument, 'taskId' | 'parentTaskId' | 'createdAt' | 'updatedAt'>>,
): Promise<WithId<CoverTaskDocument>> {
  const col = await getCollection();
  const now = new Date();
  const doc: CoverTaskDocument = {
    images: [],
    successFlag: 0,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getCoverTaskByTaskId(
  taskId: string,
): Promise<WithId<CoverTaskDocument> | null> {
  const col = await getCollection();
  return col.findOne({ taskId });
}

export async function getCoverTasksByParentTaskId(
  parentTaskId: string,
): Promise<WithId<CoverTaskDocument>[]> {
  const col = await getCollection();
  return col.find({ parentTaskId }).sort({ createdAt: -1 }).toArray();
}

export async function getAllCoverTasks(
  limit = 500,
  skip = 0,
): Promise<WithId<CoverTaskDocument>[]> {
  const col = await getCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function updateCoverTask(
  taskId: string,
  patch: Partial<CoverTaskDocument>,
): Promise<void> {
  const col = await getCollection();
  await col.updateOne(
    { taskId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deleteCoverTask(taskId: string): Promise<void> {
  const col = await getCollection();
  await col.deleteOne({ taskId });
}
