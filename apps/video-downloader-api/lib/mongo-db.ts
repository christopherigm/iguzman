import { MongoClient, Db } from 'mongodb';
import { MONGO_DB } from '@/config';

const MONGO_URI = process.env.MONGO_URI;

const client = new MongoClient(MONGO_URI ?? '');

export const dbOpenConnection = (): Promise<Db> => {
  return new Promise((res, rej) => {
    client
      .connect()
      .then((client) => res(client.db(MONGO_DB)))
      .catch((error) => rej(error));
  });
};

export const dbCloseConnection = () => client.close();
