import logger from './logger.js';

const VIDEO_DOWNLOADER_URL =
  process.env.VIDEO_DOWNLOADER_URL ??
  'http://video-downloader.video-downloader-2.svc.cluster.local';

export async function notifyJobProgress(
  brokerJobId: string,
  progress: number,
): Promise<void> {
  try {
    const url = `${VIDEO_DOWNLOADER_URL}/api/server-processing/${brokerJobId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'processing', progress }),
    });
    if (!res.ok) {
      logger.warn(
        { brokerJobId, status: res.status },
        'Progress callback returned non-OK',
      );
    }
  } catch (err) {
    logger.error({ err, brokerJobId }, 'Failed to notify job progress');
  }
}

export async function notifyJobComplete(
  brokerJobId: string,
  result: { success: boolean; outputFile?: string; error?: string },
): Promise<void> {
  try {
    const url = `${VIDEO_DOWNLOADER_URL}/api/server-processing/${brokerJobId}`;
    const body = result.success
      ? {
          status: 'done',
          progress: 100,
          outputFile: result.outputFile,
          error: null,
        }
      : {
          status: 'error',
          progress: 0,
          outputFile: null,
          error: result.error,
        };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      logger.warn(
        { brokerJobId, status: res.status },
        'Job completion callback returned non-OK',
      );
    }
  } catch (err) {
    logger.error({ err, brokerJobId }, 'Failed to notify job completion');
  }
}
