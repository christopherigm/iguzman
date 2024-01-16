import { dbOpenConnection } from '@/lib/mongo-db';
import { MONGO_DB_ITEM_COLLECTION } from '@/config';
import type Item from '@/types/items';
import { ObjectId } from 'mongodb';
import type { Document } from 'mongodb';

export const getAllItems = (query: Item): Promise<Array<Document>> => {
  return new Promise((res, rej) => {
    dbOpenConnection()
      .then(async (db) => {
        const collection = db.collection(MONGO_DB_ITEM_COLLECTION);
        const items = await collection.find(query);
        return res(items.toArray() ?? []);
      })
      .catch((error) => rej(error));
  });
};

export const getOrCreateItem = (item: Item): Promise<Item> => {
  return new Promise((res, rej) => {
    if (item.url || item.id) {
      getItem(item)
        .then((i) => {
          if (i && i.url) {
            return res(i);
          }
          if (item.id) {
            item._id = new ObjectId(item.id);
          }
          createItem(item)
            .then(() => getItem(item))
            .then((i) => {
              if (i) {
                return res(i);
              }
              rej('Error reading item');
            })
            .catch((error) => rej(error));
        })
        .catch((error) => rej(error));
    } else {
      rej('Error reading item');
    }
  });
};

export const createItem = (item: Item): Promise<string> => {
  return new Promise((res, rej) => {
    dbOpenConnection()
      .then(async (db) => {
        const collection = db.collection(MONGO_DB_ITEM_COLLECTION);
        const newItem = { ...item };
        newItem.created = new Date();
        const insert = await collection.insertOne(newItem);
        res(insert.insertedId.toString());
      })
      .catch((error) => rej(error));
  });
};

export const getItem = (query: Item): Promise<Item | null> => {
  return new Promise((res, rej) => {
    dbOpenConnection()
      .then(async (db) => {
        const collection = db.collection(MONGO_DB_ITEM_COLLECTION);
        const item: Document | null = await collection.findOne(query);
        if (item) {
          const i: Item = { id: item._id.toString(), ...item };
          delete i.remoteAddress;
          return res(i as Item);
        }
        return res(null);
      })
      .catch((error) => rej(error));
  });
};

export const updateItem = (item: Item): Promise<Item> => {
  return new Promise((res, rej) => {
    dbOpenConnection()
      .then(async (db) => {
        const collection = db.collection(MONGO_DB_ITEM_COLLECTION);
        const newItem = { ...item };
        delete newItem._id;
        await collection.updateOne(
          { url: item.url, justAudio: item.justAudio },
          { $set: newItem }
        );
        res(newItem);
      })
      .catch((error) => rej(error));
  });
};
