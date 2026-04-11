/**
 * Personas collection.
 *
 * Corresponds to POST /api/v1/generate/generate-persona.
 * A persona captures the style/voice characteristics of a generated audio
 * track and can be reused in subsequent generation requests.
 */

import type { Collection, WithId } from 'mongodb';
import { getDatabase } from '@/lib/db/connection';

/* ------------------------------------------------------------------ */
/*  Document schema                                                    */
/* ------------------------------------------------------------------ */

export interface PersonaDocument {
  /** Unique persona ID returned by the Suno API. */
  personaId: string;
  /** Music generation task ID used as the source. */
  taskId: string;
  /** Audio ID within that task used as the source. */
  audioId: string;
  name: string;
  description: string;
  style?: string | null;
  /** Start time (seconds) of the analysed audio segment. Default 0. */
  vocalStart?: number | null;
  /** End time (seconds) of the analysed audio segment. Default 30. */
  vocalEnd?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Collection helper                                                  */
/* ------------------------------------------------------------------ */

const COLLECTION = 'personas';

let indexesEnsured = false;

async function getCollection(): Promise<Collection<PersonaDocument>> {
  const db = await getDatabase();
  const col = db.collection<PersonaDocument>(COLLECTION);

  if (!indexesEnsured) {
    await col.createIndexes([
      { key: { personaId: 1 }, unique: true },
      { key: { taskId: 1 } },
      { key: { audioId: 1 } },
      { key: { createdAt: -1 } },
    ]);
    indexesEnsured = true;
  }

  return col;
}

/* ------------------------------------------------------------------ */
/*  CRUD helpers                                                       */
/* ------------------------------------------------------------------ */

export async function createPersona(
  data: Omit<PersonaDocument, 'createdAt' | 'updatedAt'>,
): Promise<WithId<PersonaDocument>> {
  const col = await getCollection();
  const now = new Date();
  const doc: PersonaDocument = { ...data, createdAt: now, updatedAt: now };
  const { insertedId } = await col.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function getPersonaByPersonaId(
  personaId: string,
): Promise<WithId<PersonaDocument> | null> {
  const col = await getCollection();
  return col.findOne({ personaId });
}

export async function getPersonasByTaskId(
  taskId: string,
): Promise<WithId<PersonaDocument>[]> {
  const col = await getCollection();
  return col.find({ taskId }).sort({ createdAt: -1 }).toArray();
}

export async function getPersonaByAudioId(
  audioId: string,
): Promise<WithId<PersonaDocument> | null> {
  const col = await getCollection();
  return col.findOne({ audioId });
}

export async function getAllPersonas(
  limit = 500,
  skip = 0,
): Promise<WithId<PersonaDocument>[]> {
  const col = await getCollection();
  return col.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
}

export async function updatePersona(
  personaId: string,
  patch: Partial<PersonaDocument>,
): Promise<void> {
  const col = await getCollection();
  await col.updateOne(
    { personaId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

export async function deletePersona(personaId: string): Promise<void> {
  const col = await getCollection();
  await col.deleteOne({ personaId });
}
