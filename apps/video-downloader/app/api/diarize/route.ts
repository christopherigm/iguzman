import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { access, readFile, unlink, writeFile } from 'node:fs/promises';
import {
  getCreditsKey,
  requireCredits,
  creditsErrorResponse,
} from '@/lib/credits-middleware';
import { USE_R2, downloadToPath, uploadFromPath } from '@/lib/r2';
import {
  diarizationToSrt,
  DIARIZE_CREDITS_PER_SECOND,
  type DiarizationSegment,
} from '@/lib/srt-from-diarization';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/diarize' });

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'development';
const IS_PROD = NODE_ENV === 'production';
const MEDIA_DIR = IS_PROD ? '/app/media' : './public/media';
const TEMP_DIR = '/tmp';

const DIARIZATION_URL =
  process.env.DIARIZATION_URL ?? 'https://diarization.iguzman.com.mx';
const DIARIZATION_API_KEY = process.env.DIARIZATION_API_KEY ?? '';

export async function POST(request: NextRequest) {
  let body: { file?: string; duration?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { file: inputFile, duration } = body;

  if (!inputFile || typeof inputFile !== 'string') {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (inputFile.includes('/') || inputFile.includes('..')) {
    log.warn({ inputFile }, 'Path traversal attempt in inputFile');
    return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
  }
  if (!duration || duration <= 0) {
    return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
  }

  const creditsKey = getCreditsKey(request);
  if (!creditsKey) return creditsErrorResponse('NO_CREDITS_KEY');

  const cost = Math.ceil(duration * DIARIZE_CREDITS_PER_SECOND);
  const creditResult = await requireCredits(creditsKey, cost);
  if (!creditResult.ok) return creditsErrorResponse(creditResult.error);

  /* ── Resolve input path (staged in /tmp or download from R2) ─────── */
  let tempInputPath: string | undefined;
  if (USE_R2) {
    tempInputPath = join(TEMP_DIR, inputFile);
    const alreadyStaged = await access(tempInputPath).then(() => true).catch(() => false);
    if (!alreadyStaged) {
      try {
        await downloadToPath(inputFile, tempInputPath);
      } catch (err) {
        log.error({ err, inputFile }, 'Failed to download input from R2');
        return NextResponse.json(
          { error: 'Failed to fetch input file' },
          { status: 500 },
        );
      }
    }
  }

  const inputPath = tempInputPath ?? join(MEDIA_DIR, inputFile);
  const ext = inputFile.split('.').pop()?.toLowerCase() ?? 'mp4';
  const srtFileName = `${randomUUID()}.txt`;
  const srtPath = USE_R2 ? join(TEMP_DIR, srtFileName) : join(MEDIA_DIR, srtFileName);

  try {
    /* ── Upload file to diarization service ─────────────────────────── */
    const fileBuffer = await readFile(inputPath);
    const mimeByExt: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      m4a: 'audio/mp4',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
    };
    const mime = mimeByExt[ext] ?? 'application/octet-stream';

    const form = new FormData();
    form.append('file', new Blob([fileBuffer], { type: mime }), inputFile);

    log.info({ inputFile, duration, cost }, 'Sending to diarization service');

    const diarizeRes = await fetch(`${DIARIZATION_URL}/transcribe`, {
      method: 'POST',
      headers: DIARIZATION_API_KEY
        ? { 'X-API-Key': DIARIZATION_API_KEY }
        : {},
      body: form,
    });

    if (!diarizeRes.ok) {
      const errText = await diarizeRes.text().catch(() => '');
      log.error(
        { status: diarizeRes.status, errText },
        'Diarization service error',
      );
      return NextResponse.json(
        { error: 'Diarization service error' },
        { status: 502 },
      );
    }

    const { job_id } = (await diarizeRes.json()) as { job_id: string };
    log.info({ inputFile, job_id }, 'Diarization job queued, polling for result');

    const POLL_MS = 3000;
    const MAX_POLLS = 200; // ~10 min ceiling
    let pollResult: { segments: DiarizationSegment[] } | null = null;

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));

      const pollRes = await fetch(`${DIARIZATION_URL}/jobs/${job_id}`, {
        headers: DIARIZATION_API_KEY
          ? { 'X-API-Key': DIARIZATION_API_KEY }
          : {},
      });
      if (!pollRes.ok) throw new Error(`Job poll failed: ${pollRes.status}`);

      const job = (await pollRes.json()) as {
        status: 'queued' | 'running' | 'done' | 'error';
        result: { segments: DiarizationSegment[] } | null;
        error: string | null;
      };

      if (job.status === 'done') { pollResult = job.result; break; }
      if (job.status === 'error') throw new Error(job.error ?? 'Diarization job failed');
    }

    if (!pollResult) throw new Error('Diarization timed out');

    const srtContent = diarizationToSrt(pollResult.segments);

    /* ── Save SRT and upload to R2 ──────────────────────────────────── */
    await writeFile(srtPath, srtContent, 'utf-8');

    if (USE_R2) {
      await uploadFromPath(srtFileName, srtPath);
      unlink(srtPath).catch(() => {});
    }

    log.info(
      { inputFile, srtFileName, segments: pollResult.segments.length },
      'Diarization complete',
    );

    return NextResponse.json(
      { captionsFile: srtFileName, creditsRemaining: creditResult.remaining },
      { status: 200 },
    );
  } catch (err) {
    log.error({ err, inputFile }, 'Diarization failed');
    if (USE_R2) unlink(srtPath).catch(() => {});
    return NextResponse.json({ error: 'Diarization failed' }, { status: 500 });
  } finally {
    if (tempInputPath) unlink(tempInputPath).catch(() => {});
  }
}
