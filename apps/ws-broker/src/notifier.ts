import logger from './logger.js';

const VIDEO_DOWNLOADER_URL =
  process.env.VIDEO_DOWNLOADER_URL ??
  'http://video-downloader.video-downloader-2.svc.cluster.local';
export async function notifyJobComplete(
  jobId: string,
  result: { success: boolean; outputFile?: string; error?: string },
): Promise<void> {
  const url = `${VIDEO_DOWNLOADER_URL}/api/processing-jobs/${jobId}/complete`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    });
    if (!res.ok) {
      logger.warn({ jobId, status: res.status }, 'Job completion callback returned non-OK');
    }
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to notify job completion');
  }
}
