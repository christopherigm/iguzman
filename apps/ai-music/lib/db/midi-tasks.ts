/**
 * MIDI generation tasks collection.
 *
 * Corresponds to POST /api/v1/midi/generate and
 * GET /api/v1/midi/record-info.
 *
 * MIDI tasks are derived from a vocal-removal originData audio ID and
 * produce a structured instrument+notes payload.
 */

import type { Collection, WithId } from 'mongodb';
import { getDatabase } from '@/lib/db/connection';

/* ------------------------------------------------------------------ */
/*  Document schema                                                    */
/* ------------------------------------------------------------------ */

/**
 * 0 = Pending
 * 1 = Success
 * 2 = Create task failed
 * 3 = MIDI generation failed
 */
export type MidiSuccessFlag = 0 | 1 | 2 | 3;

export interface MidiNote {
  pitch: number;
  /** Start time — may be a number (seconds) or a beat-position string. */
  start: number | string;
  /** End time — may be a number (seconds) or a beat-position string. */
  end: number | string;
  velocity: number;
}

export interface MidiInstrument {
  name: string;
  notes: MidiNote[];
}

export interface MidiData {
  state: string;
  instruments: MidiInstrument[];
}

export interface MidiTaskDocument {
  /** Task ID returned by the Suno API. */
  taskId: string;
  /** Vocal-removal task ID that produced the source audio. */
  recordTaskId: string;
  /** Audio ID from the vocal-removal originData used as the MIDI source. */
  audioId: string;
  callbackUrl?: string | null;
  successFlag: MidiSuccessFlag;
  /** Structured MIDI output (instruments and notes). */
  midiData?: MidiData | null;
  /** Completion timestamp in milliseconds (Unix epoch). */
  completeTime?: number | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Collection helper                                                  */
/* ------------------------------------------------------------------ */

const COLLECTION = 'midi_tasks';

let indexesEnsured = false;

async function getCollection(): Promise<Collection<MidiTaskDocument>> {
  const db = await getDatabase();
  const col = db.collection<MidiTaskDocument>(COLLECTION);

  if (!indexesEnsured) {
    await col.createIndexes([
      { key: { taskId: 1 }, unique: true },
      { key: { recordTaskId: 1 } },
      { key: { audioId: 1 } },
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

export async function createMidiTask(
  data: Pick<MidiTaskDocument, 'taskId' | 'recordTaskId' | 'audioId'> &
    Partial<Omit<MidiTaskDocument, 'taskId' | 'recordTaskId' | 'audioId' | 'createdAt' | 'updatedAt'>>,
): Promise<WithId<MidiTaskDocument>> {
  const col = await getCollection();
  const now = new Date();
  const doc: MidiTaskDocument = {
    successFlag: 0,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getMidiTaskByTaskId(
  taskId: string,
): Promise<WithId<MidiTaskDocument> | null> {
  const col = await getCollection();
  return col.findOne({ taskId });
}

export async function getMidiTasksByRecordTaskId(
  recordTaskId: string,
): Promise<WithId<MidiTaskDocument>[]> {
  const col = await getCollection();
  return col.find({ recordTaskId }).sort({ createdAt: -1 }).toArray();
}

export async function getMidiTaskByAudioId(
  audioId: string,
): Promise<WithId<MidiTaskDocument> | null> {
  const col = await getCollection();
  return col.findOne({ audioId });
}

export async function getAllMidiTasks(
  limit = 500,
  skip = 0,
): Promise<WithId<MidiTaskDocument>[]> {
  const col = await getCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function updateMidiTask(
  taskId: string,
  patch: Partial<MidiTaskDocument>,
): Promise<void> {
  const col = await getCollection();
  await col.updateOne(
    { taskId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deleteMidiTask(taskId: string): Promise<void> {
  const col = await getCollection();
  await col.deleteOne({ taskId });
}
