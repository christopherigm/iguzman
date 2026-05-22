import { connectToDatabase } from '@repo/helpers/mongo-db';

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

const MONGO_URI = IS_PRODUCTION
  ? (process.env.MONGO_URI ??
    'mongodb://mongodb.video-downloader-2.svc.cluster.local:27017')
  : 'mongodb://127.0.0.1:27017';

/**
 * GET /api/health
 *
 * Liveness / startup probe endpoint.
 * Returns 200 when the app can reach the database, 503 otherwise.
 * Used by Kubernetes httpGet probes so a pod is only marked Ready
 * when it has a working MongoDB connection.
 */
export async function GET() {
  try {
    const db = await connectToDatabase('videos', MONGO_URI);
    await db.command({ ping: 1 });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { ok: false, error: 'database unavailable' },
      { status: 503 },
    );
  }
}
