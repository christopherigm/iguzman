import { Db, MongoClient } from 'mongodb';

/** Default MongoDB connection URI used when `MONGO_URI` is not set. */
const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/';

/** Cached client instance, reused across calls to avoid creating multiple connections. */
let client: MongoClient | null = null;

/**
 * Returns (or creates) a singleton `MongoClient` for the given URI.
 *
 * @param uri - MongoDB connection string. Defaults to the `MONGO_URI` env variable
 *              or `mongodb://127.0.0.1:27017/` if unset.
 */
const getClient = (uri?: string): MongoClient => {
  const resolvedUri = uri ?? process.env.MONGO_URI ?? DEFAULT_MONGO_URI;

  if (!client) {
    client = new MongoClient(resolvedUri);
  }

  return client;
};

/**
 * Opens a connection to MongoDB and returns the requested database.
 *
 * If a connection already exists it will be reused.
 *
 * @param databaseName - Name of the database to connect to.
 * @param uri - Optional connection string override.
 * @returns The MongoDB `Db` handle for `databaseName`.
 *
 * @example
 * ```ts
 * const db = await connectToDatabase('my-app');
 * const users = db.collection('users');
 * ```
 */
export const connectToDatabase = async (
  databaseName: string,
  uri?: string,
): Promise<Db> => {
  const mongoClient = getClient(uri);
  await mongoClient.connect();
  return mongoClient.db(databaseName);
};

/**
 * Closes the active MongoDB connection and clears the cached client.
 *
 * Safe to call even when no connection is open.
 */
export const disconnectFromDatabase = async (): Promise<void> => {
  if (!client) return;

  await client.close();
  client = null;
};
