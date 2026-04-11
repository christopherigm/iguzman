/**
 * Vocal / stem separation tasks collection.
 *
 * Corresponds to POST /api/v1/vocal-removal/generate and
 * GET /api/v1/vocal-removal/record-info.
 *
 * Two separation modes:
 *   - 'separate_vocal'  → vocals + instrumental stems
 *   - 'split_stem'      → full multi-stem breakdown (drums, bass, guitar, …)
 */

import type { Collection, WithId } from 'mongodb';
import { getDatabase } from '@/lib/db/connection';

/* ------------------------------------------------------------------ */
/*  Document schema                                                    */
/* ------------------------------------------------------------------ */

export type VocalRemovalType = 'separate_vocal' | 'split_stem';

export type VocalRemovalSuccessFlag =
  | 'PENDING'
  | 'SUCCESS'
  | 'CREATE_TASK_FAILED'
  | 'GENERATE_AUDIO_FAILED'
  | 'CALLBACK_EXCEPTION';

export interface OriginDataItem {
  id: string;
  audio_url: string;
  duration: number;
  stem_type_group_name: string;
}

export interface VocalRemovalTaskDocument {
  /** Task ID returned by the Suno API. */
  taskId: string;
  /** Source audio ID to process. */
  musicId: string;
  /** Index of the audio clip within the source task (0-based). */
  musicIndex?: number | null;
  callbackUrl?: string | null;
  type: VocalRemovalType;
  successFlag: VocalRemovalSuccessFlag;

  /* ── separate_vocal stems ──────────────────────────────────────── */
  originUrl?: string | null;
  vocalUrl?: string | null;
  instrumentalUrl?: string | null;

  /* ── split_stem stems ──────────────────────────────────────────── */
  backingVocalsUrl?: string | null;
  drumsUrl?: string | null;
  bassUrl?: string | null;
  guitarUrl?: string | null;
  keyboardUrl?: string | null;
  percussionUrl?: string | null;
  stringsUrl?: string | null;
  synthUrl?: string | null;
  fxUrl?: string | null;
  brassUrl?: string | null;
  woodwindsUrl?: string | null;

  /** Raw origin data array returned by the API. */
  originData: OriginDataItem[];

  completeTime?: Date | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Collection helper                                                  */
/* ------------------------------------------------------------------ */

const COLLECTION = 'vocal_removal_tasks';

let indexesEnsured = false;

async function getCollection(): Promise<Collection<VocalRemovalTaskDocument>> {
  const db = await getDatabase();
  const col = db.collection<VocalRemovalTaskDocument>(COLLECTION);

  if (!indexesEnsured) {
    await col.createIndexes([
      { key: { taskId: 1 }, unique: true },
      { key: { musicId: 1 } },
      { key: { type: 1 } },
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

export async function createVocalRemovalTask(
  data: Pick<VocalRemovalTaskDocument, 'taskId' | 'musicId' | 'type'> &
    Partial<Omit<VocalRemovalTaskDocument, 'taskId' | 'musicId' | 'type' | 'createdAt' | 'updatedAt'>>,
): Promise<WithId<VocalRemovalTaskDocument>> {
  const col = await getCollection();
  const now = new Date();
  const doc: VocalRemovalTaskDocument = {
    successFlag: 'PENDING',
    originData: [],
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getVocalRemovalTaskByTaskId(
  taskId: string,
): Promise<WithId<VocalRemovalTaskDocument> | null> {
  const col = await getCollection();
  return col.findOne({ taskId });
}

export async function getVocalRemovalTasksByMusicId(
  musicId: string,
): Promise<WithId<VocalRemovalTaskDocument>[]> {
  const col = await getCollection();
  return col.find({ musicId }).sort({ createdAt: -1 }).toArray();
}

export async function getAllVocalRemovalTasks(
  limit = 500,
  skip = 0,
): Promise<WithId<VocalRemovalTaskDocument>[]> {
  const col = await getCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function updateVocalRemovalTask(
  taskId: string,
  patch: Partial<VocalRemovalTaskDocument>,
): Promise<void> {
  const col = await getCollection();
  await col.updateOne(
    { taskId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deleteVocalRemovalTask(taskId: string): Promise<void> {
  const col = await getCollection();
  await col.deleteOne({ taskId });
}
