import { NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import downloadVideo, {
  listSubtitlesViaYtDlp,
} from '@repo/helpers/download-video';
import {
  createTask,
  updateTask,
  findActiveTaskByUrl,
} from '@/lib/video-task-db';
import logger from '@/lib/logger';
import type { VideoDownloadInput } from '@/lib/types';
import {
  isScrapeCreatorsPlatform,
  fetchAllSocialComments,
} from '@/lib/scrapecreators';
import {
  getCreditsKey,
  requireCredits,
  creditsErrorResponse,
} from '@/lib/credits-middleware';

const CREDITS_PER_COMMENTS = 1;

const log = logger.child({ module: 'api/download-video' });

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

const MAX_DOWNLOAD_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5_000;

const isRateLimitError = (msg: string): boolean =>
  msg.includes('429') || /too many requests/i.test(msg);

/** Converts yt-dlp's YYYYMMDD upload_date string to a Unix timestamp in seconds. */
function parseUploadDate(date: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(date);
  if (!m) return null;
  return Date.UTC(parseInt(m[1]!), parseInt(m[2]!) - 1, parseInt(m[3]!)) / 1000;
}

type RequestBody = Partial<VideoDownloadInput> &
  Pick<VideoDownloadInput, 'url'>;

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    log.warn('Failed to parse request body as JSON');
    return NextResponse.json(
      { error: { code: 'INVALID_URL' as const, message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const {
    url,
    justAudio = false,
    checkCodec = false,
    iosDevice = false,
    maxHeight,
    captionsEnabled = false,
    captionUrl,
    commentsEnabled: commentsEnabledParam = false,
    maxComments,
  } = body;
  let commentsEnabled = commentsEnabledParam;

  if (!url || typeof url !== 'string') {
    log.warn({ url }, 'Missing or invalid url parameter');
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_URL' as const,
          message: 'Missing required parameter: url',
        },
      },
      { status: 400 },
    );
  }

  /* 0. Deduplicate: return the existing task if one is already running */
  const existing = await findActiveTaskByUrl(url);
  if (existing) {
    log.info(
      { taskId: existing._id.toHexString(), url, status: existing.status },
      'Returning existing active task (dedup)',
    );
    return NextResponse.json(
      {
        task: {
          _id: existing._id.toHexString(),
          status: existing.status,
          url,
          justAudio,
          checkCodec,
        },
      },
      { status: 202 },
    );
  }

  /* 1. Credit gate: every download costs 1 credit.
        Non-YouTube downloads with comments cost 1 additional credit. */
  const creditsKey = getCreditsKey(request);
  if (!creditsKey) {
    return creditsErrorResponse('NO_CREDITS_KEY');
  }
  const baseResult = await requireCredits(creditsKey, 1);
  if (!baseResult.ok) {
    return creditsErrorResponse(baseResult.error);
  }
  let creditsRemaining = baseResult.remaining;

  if (commentsEnabled && isScrapeCreatorsPlatform(url)) {
    const creditResult = await requireCredits(creditsKey, CREDITS_PER_COMMENTS);
    if (!creditResult.ok) commentsEnabled = false;
    else creditsRemaining = creditResult.remaining;
  }

  /* 2. Create the task document immediately */
  const task = await createTask({
    url,
    justAudio,
    checkCodec,
    iosDevice,
    maxHeight,
    captionsEnabled,
    captionUrl,
    commentsEnabled,
    maxComments,
  });
  const taskId = task._id.toHexString();

  /* 3. Fire-and-forget: the download runs independently of the status update
        so a transient DB hiccup on the first updateTask cannot prevent the
        download from starting. */
  void (async () => {
    /* Best-effort status update — does NOT gate the download. */
    updateTask(taskId, { status: 'downloading', progress: 0 }).catch(
      (err: unknown) =>
        log.error({ err, taskId }, 'Failed to set task status to downloading'),
    );

    log.info({ taskId, url, justAudio, checkCodec }, 'Download started');

    try {
      let resolvedCaptionUrl = captionUrl;
      if (captionsEnabled && !justAudio && !resolvedCaptionUrl) {
        try {
          const subs = await listSubtitlesViaYtDlp(url);
          if (subs.length > 0) {
            const preferred =
              subs.find((s) => /orig/i.test(s.lang)) ??
              subs.find((s) => /^en/i.test(s.lang)) ??
              subs[0];
            resolvedCaptionUrl = preferred?.url;
            log.info(
              { url, lang: preferred?.lang, captionUrl: resolvedCaptionUrl },
              'Resolved caption URL via subtitle listing',
            );
          }
        } catch (err) {
          log.warn(
            { err, url },
            'Subtitle listing failed (captions will be skipped)',
          );
        }
      }

      const downloadInput = {
        url,
        justAudio,
        checkCodec,
        iosDevice,
        maxHeight,
        captions: captionsEnabled,
        captionUrl: resolvedCaptionUrl,
        commentsEnabled,
        maxComments,
        outputFolder: IS_PRODUCTION ? '/app/media' : './public/media',
        cookies: IS_PRODUCTION
          ? '/app/media/netscape-cookies.txt'
          : './netscape-cookies.txt',
      };

      let result = await downloadVideo(downloadInput);

      for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
        if (!result.error || !isRateLimitError(result.error.message)) break;
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        log.warn(
          { taskId, url, attempt, delayMs },
          'Download rate-limited by platform, retrying',
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        result = await downloadVideo(downloadInput);
      }

      if (result.error) {
        log.error(
          {
            taskId,
            url,
            errorCode: result.error.code,
            error: result.error.message,
          },
          'Download failed',
        );
        await updateTask(taskId, {
          status: 'error',
          progress: 0,
          error: result.error,
          result,
        });
      } else {
        log.info(
          {
            taskId,
            url,
            file: result.file,
            duration: result.metadata?.duration,
          },
          'Download completed',
        );

        /* ── ScrapeCreators fallback for social platforms ──────────────
         * yt-dlp cannot retrieve comments from Facebook, Instagram, or
         * TikTok. When commentsEnabled is set and yt-dlp came up empty,
         * fetch via ScrapeCreators and write the comments file ourselves. */
        let commentsFile = result.commentsFile ?? null;
        let scrapeCreditsRemaining: number | null = null;
        if (
          commentsEnabled &&
          !justAudio &&
          !commentsFile &&
          isScrapeCreatorsPlatform(url)
        ) {
          try {
            const { comments, creditsRemaining } = await fetchAllSocialComments(
              url,
              maxComments ?? 20,
            );
            scrapeCreditsRemaining = creditsRemaining;
            if (comments.length > 0 && result.file) {
              const fileId = result.file.replace(/\.[^.]+$/, '');
              const folder = IS_PRODUCTION ? '/app/media' : './public/media';
              const filename = `${fileId}.comments.json`;
              writeFileSync(`${folder}/${filename}`, JSON.stringify(comments));
              commentsFile = filename;
              log.info(
                { taskId, url, count: comments.length },
                'ScrapeCreators comments saved',
              );
            }
          } catch (err) {
            log.warn(
              { err, taskId, url },
              'ScrapeCreators comment fetch failed (non-fatal)',
            );
          }
        }

        const meta = result.metadata;
        await updateTask(taskId, {
          status: 'done',
          progress: 100,
          result,
          file: result.file ?? null,
          name: result.name ?? null,
          fulltitle: meta?.fulltitle ?? meta?.title ?? null,
          isH265: result.isH265 ?? null,
          thumbnail: result.thumbnail ?? null,
          duration: meta?.duration ?? null,
          uploader: meta?.uploader ?? null,
          uploader_id: meta?.uploader_id ?? null,
          uploader_url: meta?.uploader_url ?? null,
          uploadTimestamp:
            meta?.timestamp ??
            (meta?.upload_date ? parseUploadDate(meta.upload_date) : null),
          description: meta?.description ?? null,
          tags: meta?.tags?.length ? meta.tags : null,
          sourceFps: result.fps ?? null,
          width:
            result.formatSelection?.bestVideo?.width ??
            result.formatSelection?.bestCombined?.width ??
            null,
          height:
            result.formatSelection?.bestVideo?.height ??
            result.formatSelection?.bestCombined?.height ??
            null,
          captionsFile: result.captionsFile ?? null,
          commentsFile,
          scrapeCreditsRemaining,
        });
      }
    } catch (err) {
      log.error({ err, taskId, url }, 'Unexpected error during download');
      await updateTask(taskId, {
        status: 'error',
        progress: 0,
        error: {
          code: 'DOWNLOAD_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      }).catch((dbErr: unknown) =>
        log.error(
          { err: dbErr, taskId },
          'Failed to update task to error status',
        ),
      );
    }
  })();

  /* 4. Respond immediately with the task document */
  return NextResponse.json(
    {
      task: {
        _id: taskId,
        status: 'pending',
        url,
        justAudio,
        checkCodec,
      },
      creditsRemaining,
    },
    { status: 202 },
  );
}
