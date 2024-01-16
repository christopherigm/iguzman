import type { NextApiRequest, NextApiResponse } from 'next';
import NextCors from '@/lib/cors';
import { ObjectId } from 'mongodb';
import { getItem } from '@/lib/item';
import type Item from '@/types/items';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Item | string>
) {
  NextCors(req, res)
    .then(() => {
      const queryItem: Item = {};
      if (req.query.id) {
        queryItem._id = new ObjectId(req.query.id?.toString());
      }
      getItem(queryItem)
        .then((item) => {
          if (item) {
            res.status(200).json(item);
          } else {
            res.status(400).end();
          }
        })
        .catch((error) => res.status(400).send(error.toString()));
    })
    .catch((error) => res.status(400).send(error.toString()));
}
