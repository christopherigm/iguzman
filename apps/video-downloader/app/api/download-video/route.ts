import { NextResponse } from 'next/server';
import downloadVideo from '@repo/helpers/download-video';
import type {
  DownloadVideoResult,
  DownloadVideoError,
} from '@repo/helpers/download-video';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

interface RequestBody {
  url: string;
  justAudio?: boolean;
  checkCodec?: boolean;
}

interface SuccessResponse {
  data: DownloadVideoResult;
}

interface ErrorResponse {
  error: DownloadVideoError;
}

export async function POST(
  request: Request,
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_URL' as const, message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const { url, justAudio, checkCodec } = body;

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

  const result = await downloadVideo({
    url,
    justAudio,
    checkCodec,
    outputFolder: IS_PRODUCTION ? '/app/media' : './public/media',
    cookies: IS_PRODUCTION
      ? '/app/netscape-cookies.txt'
      : './netscape-cookies.txt',
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result });
}
