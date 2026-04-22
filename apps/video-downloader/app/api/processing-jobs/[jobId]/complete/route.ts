import { NextRequest, NextResponse } from 'next/server';
import { getProcessingJob, updateProcessingJob } from '@/lib/processing-job-db';
import { updateTask } from '@/lib/video-task-db';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/processing-jobs/[jobId]/complete' });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

  let body: { success?: boolean; outputFile?: string; error?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const job = await getProcessingJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const now = new Date();

  if (body.success && body.outputFile) {
    await updateProcessingJob(jobId, {
      status: 'done',
      outputFile: body.outputFile,
      completedAt: now,
    });
    // Update the video task so the UI picks up the new file
    try {
      await updateTask(job.taskId, { file: body.outputFile, status: 'done' });
    } catch (err) {
      log.warn({ err, taskId: job.taskId }, 'Failed to update video task after job completion');
    }
    log.info({ jobId, taskId: job.taskId, outputFile: body.outputFile }, 'Processing job completed');
  } else {
    await updateProcessingJob(jobId, {
      status: 'error',
      error: body.error ?? 'Unknown error',
      completedAt: now,
    });
    try {
      await updateTask(job.taskId, { status: 'error', error: { message: body.error ?? 'Processing failed', code: 'DOWNLOAD_FAILED' } });
    } catch (err) {
      log.warn({ err, taskId: job.taskId }, 'Failed to update video task after job error');
    }
    log.warn({ jobId, taskId: job.taskId, error: body.error }, 'Processing job failed');
  }

  return NextResponse.json({ ok: true });
}
