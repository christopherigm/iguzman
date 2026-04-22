import { connectToDatabase } from '@repo/helpers/mongo-db';
import type { Collection } from 'mongodb';
import type { WsClientDoc, ProcessingJobDoc } from './types.js';

const DB_NAME = 'videos';
const IS_PROD = process.env.NODE_ENV === 'production';
const MONGO_URI = IS_PROD
  ? (process.env.MONGO_URI ?? 'mongodb://mongodb.video-downloader-2.svc.cluster.local:27017')
  : 'mongodb://127.0.0.1:27017';

let clientsCol: Collection<WsClientDoc> | null = null;
let jobsCol: Collection<ProcessingJobDoc> | null = null;

async function getClientsCol(): Promise<Collection<WsClientDoc>> {
  if (!clientsCol) {
    const db = await connectToDatabase(DB_NAME, MONGO_URI);
    clientsCol = db.collection<WsClientDoc>('ws_clients');
    await clientsCol.createIndex({ uuid: 1 }, { unique: true });
  }
  return clientsCol;
}

async function getJobsCol(): Promise<Collection<ProcessingJobDoc>> {
  if (!jobsCol) {
    const db = await connectToDatabase(DB_NAME, MONGO_URI);
    jobsCol = db.collection<ProcessingJobDoc>('processing_jobs');
    await jobsCol.createIndex({ jobId: 1 }, { unique: true });
    await jobsCol.createIndex({ clientUuid: 1, createdAt: -1 });
  }
  return jobsCol;
}

export async function findClientByUuid(uuid: string): Promise<WsClientDoc | null> {
  const col = await getClientsCol();
  return col.findOne({ uuid });
}

export async function touchClient(uuid: string): Promise<void> {
  const col = await getClientsCol();
  const now = new Date();
  await col.updateOne({ uuid }, { $set: { lastConnectedAt: now, lastSeenAt: now } });
}

export async function listClients(): Promise<WsClientDoc[]> {
  const col = await getClientsCol();
  return col.find().sort({ registeredAt: -1 }).toArray();
}

export async function createJob(doc: Omit<ProcessingJobDoc, '_id'>): Promise<void> {
  const col = await getJobsCol();
  await col.insertOne(doc as ProcessingJobDoc);
}

export async function getJob(jobId: string): Promise<ProcessingJobDoc | null> {
  const col = await getJobsCol();
  return col.findOne({ jobId });
}

export async function updateJob(jobId: string, patch: Partial<ProcessingJobDoc>): Promise<void> {
  const col = await getJobsCol();
  await col.updateOne({ jobId }, { $set: { ...patch, updatedAt: new Date() } });
}
