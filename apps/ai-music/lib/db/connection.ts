import { connectToDatabase } from '@repo/helpers/mongo-db';
import type { Db } from 'mongodb';

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const DB_NAME = 'ai-music';
const MONGO_URI = IS_PRODUCTION
  ? (process.env.MONGO_URI ?? 'mongodb://mongodb.ai-music.svc.cluster.local:27017')
  : 'mongodb://127.0.0.1:27017';

export async function getDatabase(): Promise<Db> {
  return connectToDatabase(DB_NAME, MONGO_URI);
}
