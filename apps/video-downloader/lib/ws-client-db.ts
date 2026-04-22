import type { Collection, WithId } from 'mongodb';
import { connectToDatabase } from '@repo/helpers/mongo-db';

const DB_NAME = 'videos';
const IS_PROD = process.env.NODE_ENV?.trim() === 'production';
const MONGO_URI = IS_PROD
  ? (process.env.MONGO_URI ?? 'mongodb://mongodb.video-downloader-2.svc.cluster.local:27017')
  : 'mongodb://127.0.0.1:27017';

export interface WsClientDocument {
  uuid: string;
  label: string;
  registeredAt: Date;
  lastConnectedAt: Date | null;
  lastSeenAt: Date | null;
}

let col: Collection<WsClientDocument> | null = null;

async function getCol(): Promise<Collection<WsClientDocument>> {
  if (!col) {
    const db = await connectToDatabase(DB_NAME, MONGO_URI);
    col = db.collection<WsClientDocument>('ws_clients');
    await col.createIndex({ uuid: 1 }, { unique: true });
  }
  return col;
}

export async function registerClient(
  uuid: string,
  label: string,
): Promise<WithId<WsClientDocument>> {
  const c = await getCol();
  const now = new Date();
  await c.updateOne(
    { uuid },
    {
      $setOnInsert: { uuid, registeredAt: now },
      $set: { label, lastConnectedAt: null, lastSeenAt: null },
    },
    { upsert: true },
  );
  return (await c.findOne({ uuid })) as WithId<WsClientDocument>;
}

export async function getClient(uuid: string): Promise<WithId<WsClientDocument> | null> {
  const c = await getCol();
  return c.findOne({ uuid });
}

export async function listRegisteredClients(): Promise<WithId<WsClientDocument>[]> {
  const c = await getCol();
  return c.find().sort({ registeredAt: -1 }).toArray();
}

export async function deregisterClient(uuid: string): Promise<boolean> {
  const c = await getCol();
  const result = await c.deleteOne({ uuid });
  return result.deletedCount === 1;
}
