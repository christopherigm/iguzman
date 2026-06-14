import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { writeFileSync } from 'fs';
import { unlink } from 'node:fs/promises';
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
  fetchSocialMetadata,
} from '@/lib/scrapecreators';
import {
  getCreditsKey,
  requireCredits,
  refundCredits,
  creditsErrorResponse,
} from '@/lib/credits-middleware';
import {
  calculateOperationCredits,
  getVideoMetaFromFile,
} from '@/lib/operation-credits';
import { USE_R2, uploadFromPath, deleteObject } from '@/lib/r2';
import { getWritableCookiesPath } from '@/lib/writable-cookies';

const CREDITS_PER_COMMENTS = 1;
const CREDITS_PER_METADATA = 1;

const log = logger.child({ module: 'api/download-video' });

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';
const MEDIA_DIR = IS_PRODUCTION ? '/app/media' : './public/media';

// When R2 is active, downloads land in /tmp and are uploaded after completion.
const DOWNLOAD_DIR = USE_R2 ? '/tmp' : MEDIA_DIR;

const MAX_DOWNLOAD_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5_000;

const isTransientError = (msg: string): boolean =>
  msg.includes('429') ||
  /too many requests/i.test(msg) ||
  /sign in to confirm you'?re not a bot/i.test(msg);

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
    metadataEnabled: metadataEnabledParam = false,
  } = body;
  let commentsEnabled = commentsEnabledParam;
  let metadataEnabled = metadataEnabledParam;

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
  // Total credits charged up-front; refunded in full if the download fails.
  let totalCharged = 1;

  if (commentsEnabled && isScrapeCreatorsPlatform(url)) {
    const creditResult = await requireCredits(creditsKey, CREDITS_PER_COMMENTS);
    if (!creditResult.ok) commentsEnabled = false;
    else {
      creditsRemaining = creditResult.remaining;
      totalCharged += CREDITS_PER_COMMENTS;
    }
  }

  if (metadataEnabled && isScrapeCreatorsPlatform(url)) {
    const creditResult = await requireCredits(creditsKey, CREDITS_PER_METADATA);
    if (!creditResult.ok) metadataEnabled = false;
    else {
      creditsRemaining = creditResult.remaining;
      totalCharged += CREDITS_PER_METADATA;
    }
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
    metadataEnabled,
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
        outputFolder: DOWNLOAD_DIR,
        cookies: await getWritableCookiesPath(),
        binaryCheckBypass: true,
      };

      let result = await downloadVideo(downloadInput);

      for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
        if (!result.error || !isTransientError(result.error.message)) break;
        const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        log.warn(
          { taskId, url, attempt, delayMs },
          'Download blocked by platform (transient), retrying',
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
        await refundCredits(creditsKey, totalCharged).catch((refundErr: unknown) =>
          log.error({ err: refundErr, taskId }, 'Failed to refund credits after download failure'),
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
              const filename = `${fileId}.comments.json`;
              writeFileSync(join(DOWNLOAD_DIR, filename), JSON.stringify(comments));
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
        let resolvedWidth =
          result.formatSelection?.bestVideo?.width ??
          result.formatSelection?.bestCombined?.width ??
          null;
        let resolvedHeight =
          result.formatSelection?.bestVideo?.height ??
          result.formatSelection?.bestCombined?.height ??
          null;

        // Probe duration (and resolution when missing) from the file when yt-dlp metadata doesn't include it
        let resolvedDuration = meta?.duration ?? null;
        if ((resolvedDuration == null || resolvedWidth == null || resolvedHeight == null) && result.file) {
          try {
            const probed = await getVideoMetaFromFile(
              join(DOWNLOAD_DIR, result.file),
            );
            if (probed.durationSeconds != null) {
              resolvedDuration = probed.durationSeconds;
            }
            if (resolvedWidth == null && probed.width != null) {
              resolvedWidth = probed.width;
            }
            if (resolvedHeight == null && probed.height != null) {
              resolvedHeight = probed.height;
            }
          } catch {
            // non-fatal — duration/resolution stays null
          }
        }

        const operationCredits = calculateOperationCredits({
          width: resolvedWidth,
          height: resolvedHeight,
          durationSeconds: resolvedDuration,
        });

        /* ── Upload local files to R2, then clean up temp copies ─────── */
        if (USE_R2) {
          // Main video file — failure is fatal: let it propagate so the task
          // is marked 'error' instead of 'done' with a file missing from R2.
          if (result.file) {
            const localVideoPath = join(DOWNLOAD_DIR, result.file);
            await uploadFromPath(result.file, localVideoPath);
            unlink(localVideoPath).catch(() => {});
          }

          // Optional files (thumbnail, captions, comments) — best-effort only.
          const optionalFiles = [result.thumbnail, result.captionsFile, commentsFile]
            .filter((f): f is string => !!f);

          await Promise.all(
            optionalFiles.map(async (f) => {
              const localPath = join(DOWNLOAD_DIR, f);
              try {
                await uploadFromPath(f, localPath);
                unlink(localPath).catch(() => {});
              } catch (err) {
                log.warn({ err, file: f, taskId }, 'R2 upload failed for optional file');
              }
            }),
          );
        }

        /* ── ScrapeCreators metadata enrichment ──────────────────────
         * When metadataEnabled is set and the platform supports it, fetch
         * post details (title, uploader, description, timestamp) and
         * overwrite the yt-dlp values with the richer ScrapeCreators data. */
        let enrichedName: string | null = result.name ?? null;
        let enrichedFulltitle: string | null = meta?.fulltitle ?? meta?.title ?? null;
        let enrichedUploader: string | null = meta?.uploader ?? result.audioMetadata?.artist ?? null;
        let enrichedUploaderId: string | null = meta?.uploader_id ?? null;
        let enrichedUploaderUrl: string | null = meta?.uploader_url ?? null;
        let enrichedUploadTimestamp: number | null =
          meta?.timestamp ??
          (meta?.upload_date ? parseUploadDate(meta.upload_date) : null);
        let enrichedDescription: string | null = meta?.description ?? null;
        let enrichedTags: string[] | null = meta?.tags?.length ? meta.tags : null;

        if (metadataEnabled && isScrapeCreatorsPlatform(url)) {
          try {
            const scraped = await fetchSocialMetadata(url);
            if (scraped.creditsRemaining !== null)
              scrapeCreditsRemaining = scraped.creditsRemaining;
            if (scraped.name != null) enrichedName = scraped.name;
            if (scraped.fulltitle != null) enrichedFulltitle = scraped.fulltitle;
            if (scraped.uploader != null) enrichedUploader = scraped.uploader;
            if (scraped.uploader_id != null) enrichedUploaderId = scraped.uploader_id;
            if (scraped.uploader_url != null) enrichedUploaderUrl = scraped.uploader_url;
            if (scraped.uploadTimestamp != null) enrichedUploadTimestamp = scraped.uploadTimestamp;
            if (scraped.description != null) enrichedDescription = scraped.description;
            if (scraped.tags != null) enrichedTags = scraped.tags;
            log.info({ taskId, url }, 'ScrapeCreators metadata applied');
          } catch (err) {
            log.warn({ err, taskId, url }, 'ScrapeCreators metadata fetch failed (non-fatal)');
          }
        }

        await updateTask(taskId, {
          status: 'done',
          progress: 100,
          result,
          file: result.file ?? null,
          name: enrichedName,
          fulltitle: enrichedFulltitle,
          isH265: result.isH265 ?? null,
          thumbnail: result.thumbnail ?? null,
          duration: resolvedDuration,
          uploader: enrichedUploader,
          uploader_id: enrichedUploaderId,
          uploader_url: enrichedUploaderUrl,
          uploadTimestamp: enrichedUploadTimestamp,
          description: enrichedDescription,
          tags: enrichedTags,
          sourceFps: result.fps ?? null,
          width: resolvedWidth,
          height: resolvedHeight,
          captionsFile: result.captionsFile ?? null,
          commentsFile,
          scrapeCreditsRemaining,
          operationCredits,
        });
      }
    } catch (err) {
      log.error({ err, taskId, url }, 'Unexpected error during download');
      await refundCredits(creditsKey, totalCharged).catch((refundErr: unknown) =>
        log.error({ err: refundErr, taskId }, 'Failed to refund credits after download error'),
      );
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
