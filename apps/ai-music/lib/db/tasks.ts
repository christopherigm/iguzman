/**
 * Music generation tasks collection.
 *
 * Covers every Suno endpoint that returns a taskId and shares the same
 * GET /api/v1/generate/record-info polling interface:
 *   generate · extend · upload-cover · upload-extend · mashup
 *   add-instrumental · add-vocals · replace-section · sounds
 */

import type { Collection, WithId } from 'mongodb';
import { getDatabase } from '@/lib/db/connection';
import type {
  OperationType,
  TaskStatus,
  SunoModel,
  PersonaModel,
  VocalGender,
  SoundKey,
  SunoAudioItem,
} from '@/lib/db/types';

export type { OperationType, TaskStatus, SunoAudioItem };

/* ------------------------------------------------------------------ */
/*  Document schema                                                    */
/* ------------------------------------------------------------------ */

export interface MusicTaskDocument {
  /** Task ID returned by the Suno API. */
  taskId: string;
  operationType: OperationType;

  /* ── Common request params ──────────────────────────────────────── */
  model: SunoModel | string;
  callBackUrl?: string | null;
  prompt?: string | null;
  style?: string | null;
  title?: string | null;
  instrumental?: boolean | null;
  customMode?: boolean | null;
  negativeTags?: string | null;
  vocalGender?: VocalGender | null;
  styleWeight?: number | null;
  weirdnessConstraint?: number | null;
  audioWeight?: number | null;

  /* ── Persona ────────────────────────────────────────────────────── */
  personaId?: string | null;
  personaModel?: PersonaModel | null;

  /* ── Extend / replace-section ───────────────────────────────────── */
  /** Source audioId (extend, add-instrumental, add-vocals, replace-section). */
  audioId?: string | null;
  defaultParamFlag?: boolean | null;
  continueAt?: number | null;

  /* ── Upload-based (upload-cover · upload-extend · add-*) ────────── */
  uploadUrl?: string | null;
  /** Exactly 2 URLs for mashup. */
  uploadUrlList?: string[] | null;

  /* ── Replace section ────────────────────────────────────────────── */
  infillStartS?: number | null;
  infillEndS?: number | null;

  /* ── Add instrumental / add-vocals / replace-section ────────────── */
  /** Style tags (not the `style` free-text field). */
  tags?: string | null;

  /* ── Sounds ─────────────────────────────────────────────────────── */
  soundLoop?: boolean | null;
  soundTempo?: number | null;
  soundKey?: SoundKey | null;
  grabLyrics?: boolean | null;

  /* ── API response ───────────────────────────────────────────────── */
  /** Parent music ID — only set when extending existing music. */
  parentMusicId?: string | null;
  status: TaskStatus;
  sunoData: SunoAudioItem[];
  errorCode?: number | null;
  errorMessage?: string | null;

  /* ── Internal ───────────────────────────────────────────────────── */
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Collection helper                                                  */
/* ------------------------------------------------------------------ */

const COLLECTION = 'tasks';

let indexesEnsured = false;

async function getCollection(): Promise<Collection<MusicTaskDocument>> {
  const db = await getDatabase();
  const col = db.collection<MusicTaskDocument>(COLLECTION);

  if (!indexesEnsured) {
    await col.createIndexes([
      { key: { taskId: 1 }, unique: true },
      { key: { operationType: 1 } },
      { key: { status: 1 } },
      { key: { 'sunoData.id': 1 }, sparse: true },
      { key: { createdAt: -1 } },
    ]);
    indexesEnsured = true;
  }

  return col;
}

/* ------------------------------------------------------------------ */
/*  CRUD helpers                                                       */
/* ------------------------------------------------------------------ */

export async function createTask(
  data: Omit<MusicTaskDocument, 'sunoData' | 'status' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<MusicTaskDocument, 'sunoData' | 'status'>>,
): Promise<WithId<MusicTaskDocument>> {
  const col = await getCollection();
  const now = new Date();
  const doc: MusicTaskDocument = {
    sunoData: [],
    status: 'PENDING',
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getTaskByTaskId(
  taskId: string,
): Promise<WithId<MusicTaskDocument> | null> {
  const col = await getCollection();
  return col.findOne({ taskId });
}

export async function getTaskByAudioId(
  audioId: string,
): Promise<WithId<MusicTaskDocument> | null> {
  const col = await getCollection();
  return col.findOne({ 'sunoData.id': audioId });
}

export async function getAllTasks(
  limit = 500,
  skip = 0,
): Promise<WithId<MusicTaskDocument>[]> {
  const col = await getCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function getTaskCount(): Promise<number> {
  const col = await getCollection();
  return col.countDocuments();
}

export async function updateTask(
  taskId: string,
  patch: Partial<MusicTaskDocument>,
): Promise<void> {
  const col = await getCollection();
  await col.updateOne(
    { taskId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deleteTask(taskId: string): Promise<void> {
  const col = await getCollection();
  await col.deleteOne({ taskId });
}
