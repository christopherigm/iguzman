import { NextResponse } from 'next/server';
import downloadVideo from '@repo/helpers/download-video';
import { createTask, updateTask, findActiveTaskByUrl } from '@/lib/video-task-db';
import type { VideoDownloadInput } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

type RequestBody = Partial<VideoDownloadInput> &
  Pick<VideoDownloadInput, 'url'>;

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_URL' as const, message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const { url, justAudio = false, checkCodec = false } = body;

  if (!url || typeof url !== 'string') {
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

  /* 1. Deduplicate: return the existing task if one is already running */
  const existing = await findActiveTaskByUrl(url);
  if (existing) {
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

  /* 2. Create the task document immediately */
  const task = await createTask({ url, justAudio, checkCodec });
  const taskId = task._id.toHexString();

  /* 3. Fire-and-forget: the download runs independently of the status update
        so a transient DB hiccup on the first updateTask cannot prevent the
        download from starting. */
  void (async () => {
    /* Best-effort status update — does NOT gate the download. */
    updateTask(taskId, { status: 'downloading' }).catch(console.error);

    try {
      const result = await downloadVideo({
        url,
        justAudio,
        checkCodec,
        outputFolder: IS_PRODUCTION ? '/app/media' : './public/media',
        cookies: IS_PRODUCTION
          ? '/app/media/netscape-cookies.txt'
          : './netscape-cookies.txt',
      });

      if (result.error) {
        await updateTask(taskId, {
          status: 'error',
          error: result.error,
          result,
        });
      } else {
        await updateTask(taskId, {
          status: 'done',
          result,
          file: result.file ?? null,
          name: result.name ?? null,
          isH265: result.isH265 ?? null,
          thumbnail: result.thumbnail ?? null,
          duration: result.metadata?.duration ?? null,
          uploader: result.metadata?.uploader ?? null,
        });
      }
    } catch (err) {
      await updateTask(taskId, {
        status: 'error',
        error: {
          code: 'DOWNLOAD_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      }).catch(console.error);
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
    },
    { status: 202 },
  );
}
