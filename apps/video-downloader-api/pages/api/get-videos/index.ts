import type { NextApiRequest, NextApiResponse } from 'next';
import NextCors from '@/lib/cors';
import { getAllItems } from '@/lib/item';
import { ObjectId, Document } from 'mongodb';
import type Item from '@/types/items';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Array<Document> | string>
) {
  NextCors(req, res)
    .then(() => {
      const item: Item = { ...req.query };
      if (req.query.justAudio !== undefined) {
        item.justAudio = req.query.justAudio === 'true' ? true : false;
      }
      if (req.query.id) {
        item._id = new ObjectId(req.query.id?.toString());
      }
      getAllItems(item)
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
