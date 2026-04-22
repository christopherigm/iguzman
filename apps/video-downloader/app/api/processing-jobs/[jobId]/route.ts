import { NextRequest, NextResponse } from 'next/server';
import { getProcessingJob } from '@/lib/processing-job-db';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/processing-jobs/[jobId]' });

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

  try {
    const job = await getProcessingJob(jobId);
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(job);
  } catch (err) {
    log.error({ err, jobId }, 'GET processing job failed');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
