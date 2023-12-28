import cors, { CorsOptions, CorsOptionsDelegate } from 'cors';
import { NextApiRequest, NextApiResponse } from 'next';
import { CORS_CONFIGURATIONS } from '@/config';

const initMiddleware = (middleware: typeof cors) => {
  return (
    req: NextApiRequest,
    res: NextApiResponse,
    options?: CorsOptions | CorsOptionsDelegate
  ) =>
    new Promise((resolve, reject) => {
      middleware(CORS_CONFIGURATIONS)(req, res, (result: Error | unknown) => {
        if (result instanceof Error) {
          return reject(result);
        }
        return resolve(result);
      });
    });
};

const NextCors = initMiddleware(cors);

export default NextCors;
