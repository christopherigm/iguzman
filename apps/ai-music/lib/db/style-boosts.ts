/**
 * Style boost results collection.
 *
 * Corresponds to POST /api/v1/style/generate (Boost Music Style).
 * This endpoint is synchronous — the expanded style text is returned
 * immediately in the response. We persist it so the same input can be
 * served from cache without re-consuming credits.
 */

import type { Collection, WithId } from 'mongodb';
import { getDatabase } from '@/lib/db/connection';

/* ------------------------------------------------------------------ */
/*  Document schema                                                    */
/* ------------------------------------------------------------------ */

/**
 * successFlag values returned by the API:
 *   '0' = pending  '1' = success  '2' = failed
 */
export type StyleBoostSuccessFlag = '0' | '1' | '2';

export interface StyleBoostDocument {
  /** Task ID returned by the Suno API. */
  taskId: string;
  /** Raw style description sent as `content` in the request. */
  content: string;
  /** Expanded style text returned in `result`. */
  result?: string | null;
  creditsConsumed?: number | null;
  creditsRemaining?: number | null;
  successFlag?: StyleBoostSuccessFlag | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Collection helper                                                  */
/* ------------------------------------------------------------------ */

const COLLECTION = 'style_boosts';

let indexesEnsured = false;

async function getCollection(): Promise<Collection<StyleBoostDocument>> {
  const db = await getDatabase();
  const col = db.collection<StyleBoostDocument>(COLLECTION);

  if (!indexesEnsured) {
    await col.createIndexes([
      { key: { taskId: 1 }, unique: true },
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

export async function createStyleBoost(
  data: Omit<StyleBoostDocument, 'createdAt' | 'updatedAt'>,
): Promise<WithId<StyleBoostDocument>> {
  const col = await getCollection();
  const now = new Date();
  const doc: StyleBoostDocument = { ...data, createdAt: now, updatedAt: now };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getStyleBoostByTaskId(
  taskId: string,
): Promise<WithId<StyleBoostDocument> | null> {
  const col = await getCollection();
  return col.findOne({ taskId });
}

export async function getAllStyleBoosts(
  limit = 500,
  skip = 0,
): Promise<WithId<StyleBoostDocument>[]> {
  const col = await getCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function updateStyleBoost(
  taskId: string,
  patch: Partial<StyleBoostDocument>,
): Promise<void> {
  const col = await getCollection();
  await col.updateOne(
    { taskId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deleteStyleBoost(taskId: string): Promise<void> {
  const col = await getCollection();
  await col.deleteOne({ taskId });
}
