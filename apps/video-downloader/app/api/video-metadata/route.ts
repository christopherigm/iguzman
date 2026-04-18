import { NextResponse } from 'next/server';
import { fetchVideoMetadata } from '@repo/helpers/download-video';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const meta = await fetchVideoMetadata(url);
    const formats = meta.formats ?? [];

    const heights = [
      ...new Set(
        formats
          .filter(
            (f) =>
              f.vcodec !== 'none' &&
              f.vcodec != null &&
              f.height != null &&
              f.height > 0,
          )
          .map((f) => f.height as number),
      ),
    ].sort((a, b) => b - a);

    return NextResponse.json({ heights });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch metadata' },
      { status: 500 },
    );
  }
}
